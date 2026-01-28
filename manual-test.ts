import { AdocGenerator } from './src/generator';
import { Requirement, ParsedRequirements } from './src/types';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
    const outputDir = 'test-output';
    const generator = new AdocGenerator(outputDir, 'templates');

    // Create a dummy requirement for G.1 only. G.2 to G.7 should be empty.
    const reqs: Requirement[] = [{
        id: 'G.1.1',
        book: 'Goals Book',
        chapter: 'Context and overall objective', // Matches G.1 in template (prefix stripped)
        description: 'Test req',
        priority: 'Must'
    }];

    const parsed: ParsedRequirements = {
        requirements: reqs,
        books: new Set(['Goals Book'])
    };

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    console.log("Generating...");
    await generator.generate(parsed);

    const goalsFile = path.join(outputDir, 'goals-book.adoc');
    if (fs.existsSync(goalsFile)) {
        const content = fs.readFileSync(goalsFile, 'utf-8');
        console.log("File generated.");

        if (content.includes('_No requirements for this chapter._')) {
            console.log("SUCCESS: Placeholder found.");
        } else {
            console.error("FAILURE: Placeholder NOT found.");
            console.log(content);
        }
    } else {
        console.error("FAILURE: File not generated.");
    }
}

runTest().catch(console.error);
