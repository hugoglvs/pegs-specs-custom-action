import fs from 'fs';
import { parse } from 'csv-parse';
import { Requirement, ParsedRequirements } from './types';
import * as core from '@actions/core';

export async function parseRequirements(filePath: string): Promise<ParsedRequirements> {
    const requirements: Requirement[] = [];
    const books = new Set<string>();

    const parser = fs.createReadStream(filePath).pipe(
        parse({
            columns: true,
            trim: true,
            skip_empty_lines: true,
        })
    );

    for await (const record of parser) {
        // Validate schema loosely (keys might differ slightly case-wise, so we normalize or expect exact headers)
        // Expected headers: id, book, chapter, description, reference to, attached files

        // Check if required fields exist
        if (!record['id'] || !record['book'] || !record['chapter'] || !record['description']) {
            core.warning(`Skipping invalid row: ${JSON.stringify(record)}`);
            continue;
        }

        const req: Requirement = {
            id: record['id'],
            book: record['book'],
            chapter: record['chapter'],
            description: record['description'],
            priority: record['priority'],
            referenceTo: record['reference to'] || record['reference_to'], // handle both for robustness
            attachedFiles: record['attached files'] || record['attached_files'],
        };

        requirements.push(req);
        books.add(req.book);
    }

    return { requirements, books };
}
