import fs from 'fs';
import { parse } from 'csv-parse';
import { Requirement, ParsedRequirements } from './types';
import { Structure } from './structure';
import * as core from '@actions/core';

export async function parseRequirements(filePath: string, structure: Structure): Promise<ParsedRequirements> {
    const requirements: Requirement[] = [];
    const parts = new Set<string>();

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

        // Infer Part and Section from ID
        // ID format: G.1.1 -> Part: G, Section: G.1
        const idParts = id.split('.');
        if (idParts.length < 2) {
            core.warning(`Skipping row with invalid ID format (cannot infer Part/Section): ${id}. Expected format X.Y...`);
            continue;
        }

        const partId = idParts[0];
        const sectionId = `${idParts[0]}.${idParts[1]}`;

        const partNode = structure.partMap.get(partId);
        const sectionNode = structure.partMap.get(sectionId); // We store both in partMap (ID -> Node)

        if (!partNode) {
            core.warning(`Skipping row: Part ID '${partId}' not found in structure.`);
            continue;
        }
        if (!sectionNode) {
            core.warning(`Skipping row: Section ID '${sectionId}' not found in structure.`);
            continue;
        }

        const req: Requirement = {
            id: id,
            part: partNode.title, // Renamed from book
            section: sectionNode.title, // Renamed from chapter
            description: record['description'],
            priority: record['priority'],
            parent: record['parent'],
            referenceTo: record['reference to'] || record['reference_to'],
            attachedFiles: record['attached files'] || record['attached_files'],
        };

        requirements.push(req);
        parts.add(req.part);
    }

    return { requirements, parts };
}
