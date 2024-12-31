import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { access, mkdir } from 'fs/promises';
import { constants } from 'fs';

const execAsync = promisify(exec);

export class PythonSetup {
  private venvPath: string;
  private modelPath: string;
  private pythonCommand: string;
  private pipCommand: string;
  private moondreamProcess: any;

  constructor() {
    // Use temporary directory for venv to avoid permission issues
    this.venvPath = join(process.env.TMPDIR || '/tmp', 'moondream-venv');
    // Use models directory in project root, ensuring we're in moondream-server directory
    const moduleURL = new URL(import.meta.url);
    const projectRoot = join(moduleURL.pathname, '..', '..', '..');
    this.modelPath = join(projectRoot, 'models');
    
    console.log('PythonSetup initialized with:');
    console.log(`- Working directory: ${process.cwd()}`);
    console.log(`- Venv path: ${this.venvPath}`);
    console.log(`- Model path: ${this.modelPath}`);
    
    this.pythonCommand = process.platform === 'win32'
      ? join(this.venvPath, 'Scripts', 'python.exe')
      : join(this.venvPath, 'bin', 'python');
    this.pipCommand = process.platform === 'win32'
      ? join(this.venvPath, 'Scripts', 'pip.exe')
      : join(this.venvPath, 'bin', 'pip');
  }

  async ensureUVInstalled(): Promise<void> {
    try {
      await execAsync('uv --version');
    } catch (error) {
      console.error('UV not found, installing...');
      try {
        await execAsync('curl -LsSf https://astral.sh/uv/install.sh | sh');
    } catch (error) {
      const { stdout: pwd } = await execAsync('pwd');
      throw new Error(`Failed to download model: ${error}. Current working directory: ${pwd.trim()}`);
    }
    }
  }

  async setupPythonEnvironment(): Promise<void> {
    try {
      // Check if venv exists and is valid
      const pythonExists = await access(this.pythonCommand)
        .then(() => true)
        .catch(() => false);
      
      if (pythonExists) {
        console.log('Using existing virtual environment');
        return;
      }

      console.log('Creating virtual environment...');
      // Create venv in temp directory
      await execAsync(`uv venv "${this.venvPath}"`);
    } catch (error) {
      throw new Error(`Failed to setup virtual environment: ${error}`);
    }
  }

  async installMoondream(): Promise<void> {
    try {
      // Check if moondream is already installed
      const result = await execAsync(`${this.pythonCommand} -c "import moondream"`)
        .then(() => true)
        .catch(() => false);
      
      if (result) {
        console.log('Moondream already installed');
        return;
      }

      console.log('Installing moondream...');
      await execAsync(`uv pip install moondream`, {
        env: {
          ...process.env,
          VIRTUAL_ENV: this.venvPath,
          PATH: `${this.venvPath}/bin:${process.env.PATH}`
        }
      });
    } catch (error) {
      throw new Error(`Failed to install moondream: ${error}`);
    }
  }

  async downloadModel(): Promise<void> {
    try {
      console.log(`Current working directory: ${process.cwd()}`);
      console.log(`Attempting to access models at: ${join(process.cwd(), this.modelPath)}`);
      
      const modelFile = join(this.modelPath, 'moondream-0_5b-int4.mf.gz');
      
      // First check if model file exists
      try {
        await access(modelFile, constants.F_OK);
        console.log('Model file already exists, skipping download');
        return;
      } catch {
        // Model file doesn't exist, continue with directory check and download
      }

      // Only check directory if we need to download
      try {
        await access(this.modelPath, constants.F_OK | constants.W_OK);
        console.log('Models directory exists and is writable');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log('Models directory does not exist, attempting to create...');
          try {
            await mkdir(this.modelPath, { recursive: true });
          } catch (mkdirError: any) {
            throw new Error(`Failed to create models directory at ${this.modelPath}. Error: ${mkdirError.message}. Please check directory permissions and ensure you have write access.`);
          }
        } else if (error.code === 'EACCES') {
          throw new Error(`Models directory ${this.modelPath} exists but is not writable. Please check directory permissions.`);
        } else {
          throw new Error(`Cannot access models directory ${this.modelPath}. Error: ${error.message}`);
        }
      }
      
      console.log('Downloading model file...');
      await execAsync(
        `wget https://huggingface.co/vikhyatk/moondream2/resolve/9dddae84d54db4ac56fe37817aeaeb502ed083e2/moondream-0_5b-int4.mf.gz -P "${this.modelPath}"`
      );
    } catch (error) {
      const { stdout: pwd } = await execAsync('pwd');
      throw new Error(`Failed to download model: ${error}. Current working directory: ${pwd.trim()}`);
    }
  }

  async startMoondreamServer(): Promise<void> {
    const modelFile = 'moondream-0_5b-int4.mf.gz';
    const moondreamBin = process.platform === 'win32' 
      ? join(this.venvPath, 'Scripts', 'moondream.exe')
      : join(this.venvPath, 'bin', 'moondream');
    
    const command = `"${moondreamBin}" serve --model ${modelFile}`;
    
    try {
      this.moondreamProcess = exec(command, {
        cwd: this.modelPath // Execute from models directory
      }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Moondream server error: ${error}`);
          return;
        }
        if (stdout) console.error(`[Moondream] ${stdout}`);
        if (stderr) console.error(`[Moondream] ${stderr}`);
      });

      // Wait for server to start
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 30;
        
        const checkServer = async () => {
          try {
            // Try a simple request to see if the server is responding
            const response = await fetch('http://127.0.0.1:3475/caption', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                image_url: 'data:image/jpeg;base64,/9j' // Invalid but should get a proper error if server is up
              })
            });
            
            // If we get any response, even an error, the server is running
            console.error('[Setup] Moondream server started successfully');
            resolve();
          } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
              reject(new Error('Failed to start moondream server after 30 attempts'));
            } else {
              setTimeout(checkServer, 1000);
            }
          }
        };
        
        // Start checking after a brief delay to let the server initialize
        setTimeout(checkServer, 2000);
      });
    } catch (error) {
      throw new Error(`Failed to start moondream server: ${error}`);
    }
  }

  async setup(): Promise<void> {
    await this.ensureUVInstalled();
    await this.setupPythonEnvironment();
    await this.installMoondream();
    await this.downloadModel();
    await this.startMoondreamServer();
  }

  cleanup(): void {
    if (this.moondreamProcess) {
      this.moondreamProcess.kill();
    }
  }
}
