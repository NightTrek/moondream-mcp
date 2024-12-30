import { vl } from 'moondream';
import { promises as fs } from 'fs';

const model = new vl({ apiUrl: "http://127.0.0.1:3475", timeout: 300000 });  // Initialize client

async function main() {
    try {
        const imagePath = "./testPhoto.JPEG";
        console.log(`Reading image from ${imagePath}...`);
        const encodedImage = Buffer.from(await fs.readFile(imagePath));  // Load and encode image

        // 1. Caption the image
        console.log("\nGenerating caption...")
        const caption = await model.caption({ image: encodedImage })
        console.log("Caption:", caption)

        // 2. Query the image
        console.log("\nQuerying image...")
        const answer = await model.query({ image: encodedImage, question: "What's in this image?" })
        console.log("Answer:", answer)

        // 3. Detect objects
        console.log("\nDetecting objects...")
        const detectResult = await model.detect({ image: encodedImage, object: "subject" })
        console.log("Detected:", detectResult.objects)

    } catch (error) { 
        console.error("Error:", error) 
    }
}

main().catch(console.error);
