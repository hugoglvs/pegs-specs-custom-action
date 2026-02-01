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
            core.warning(`Skipping row with invalid ID format (cannot infer Part/Section): ${id}. Expected format prefix.number...`);
            continue;
        }

        // Find match in structure
        let partNode = null;
        let sectionNode = null;

        // Start from longest possible prefix for section, and shortest for part
        // e.g. G.1.2.3 -> check G.1.2, then G.1 (Section)
        // and check G (Part)

        // Find Part (usually first segment)
        const partId = idParts[0];
        partNode = structure.partMap.get(partId);

        // Find best Section (longest matching prefix that exists in structure and is a Section)
        for (let i = idParts.length - 1; i >= 1; i--) {
            const potentialSectionId = idParts.slice(0, i).join('.');
            const node = structure.partMap.get(potentialSectionId);
            if (node && node.type === 'Section') {
                sectionNode = node;
                break;
            }
        }

        if (!partNode) {
            core.warning(`Skipping row ${id}: Part ID '${partId}' not found in structure.`);
            continue;
        }
        if (!sectionNode) {
            core.warning(`Skipping row ${id}: No matching Section found for ID prefix in structure.`);
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
