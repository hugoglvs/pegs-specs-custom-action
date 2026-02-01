import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

export interface StructureNode {
    id: string;      // e.g., "G", "G.1"
    type: 'Part' | 'Section'; // New field for hierarchy determination
    title: string;
    description: string;
    required: boolean;
    children: StructureNode[];
}

export interface Structure {
    parts: StructureNode[]; // Renamed from 'books' to avoid confusion, though interface structure is same
    partMap: Map<string, StructureNode>; // Map ID -> Node
}

export function loadStructure(filePath: string): Structure {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Structure file not found at ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
            if (context.column === 'required') {
                return value.toLowerCase() === 'true';
            }
            return value;
        }
    }) as { id: string; type: string; title: string; description: string; required: any }[];

    const rootNodes: StructureNode[] = [];
    const nodeMap = new Map<string, StructureNode>();

    // First pass: Create all nodes
    for (const record of records) {
        // Robust type handling
        let rawType = (record.type || '').trim().toLowerCase();
        let type: 'Part' | 'Section';

        if (rawType === 'part') {
            type = 'Part';
        } else if (rawType === 'section') {
            type = 'Section';
        } else {
            // Defaulting logic: Section if it has dots, Part otherwise
            type = record.id.includes('.') ? 'Section' : 'Part';
            console.warn(`Warning: Unknown type '${record.type}' for ID ${record.id}. Defaulting to ${type}.`);
        }

        const node: StructureNode = {
            id: record.id,
            type: type,
            title: record.title,
            description: record.description,
            required: !!record.required,
            children: []
        };
        nodeMap.set(record.id, node);
    }

    // Second pass: Build hierarchy
    for (const node of nodeMap.values()) {
        if (node.type === 'Part') {
            rootNodes.push(node);
        } else {
            // It is a Section, find its parent
            if (node.id.includes('.')) {
                const idSegments = node.id.split('.');
                // Parent ID is the ID without the last segment
                const parentId = idSegments.slice(0, -1).join('.');
                const parent = nodeMap.get(parentId);
                if (parent) {
                    parent.children.push(node);
                } else {
                    // Fallback to the first segment as part if intermediate parent not found
                    const rootPartId = idSegments[0];
                    const rootPart = nodeMap.get(rootPartId);
                    if (rootPart) {
                        rootPart.children.push(node);
                    } else {
                        console.warn(`Warning: Section ${node.id} has no valid parent in structure`);
                    }
                }
            } else {
                console.warn(`Warning: Section ${node.id} has no parent indicator in ID`);
            }
        }
    }

    return {
        parts: rootNodes,
        partMap: nodeMap
    };
}
