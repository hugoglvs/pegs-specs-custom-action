import fs from 'fs';
import { parse } from 'csv-parse';
import { Requirement, ParsedRequirements } from './types';
import { Structure } from './structure';
import * as core from '@actions/core';

export async function parseRequirements(filePath: string, structure: Structure): Promise<ParsedRequirements> {
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
        // Expected headers: id, description (others optional: parent, reference to, attached files)
        // Removed: book, chapter (inferred)

        if (!record['id'] || !record['description']) {
            core.warning(`Skipping invalid row (missing id or description): ${JSON.stringify(record)}`);
            continue;
        }

        const id = record['id'];

        // Infer Book and Chapter from ID
        // ID format: G.1.1 -> Book: G, Chapter: G.1
        const parts = id.split('.');
        if (parts.length < 2) {
            core.warning(`Skipping row with invalid ID format (cannot infer Book/Chapter): ${id}. Expected format X.Y...`);
            continue;
        }

        const bookId = parts[0];
        const chapterId = `${parts[0]}.${parts[1]}`;

        const bookNode = structure.bookMap.get(bookId);
        const chapterNode = structure.bookMap.get(chapterId);

        if (!bookNode) {
            core.warning(`Skipping row: Book ID '${bookId}' not found in structure.`);
            continue;
        }
        if (!chapterNode) {
            core.warning(`Skipping row: Chapter ID '${chapterId}' not found in structure.`);
            continue;
        }

        const req: Requirement = {
            id: id,
            book: bookNode.title,
            chapter: chapterNode.title,
            description: record['description'],
            priority: record['priority'],
            parent: record['parent'],
            referenceTo: record['reference to'] || record['reference_to'],
            attachedFiles: record['attached files'] || record['attached_files'],
        };

        requirements.push(req);
        books.add(req.book);
    }

    return { requirements, books };
}
