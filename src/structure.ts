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
        // Validate type
        const type = record.type as 'Part' | 'Section';
        if (type !== 'Part' && type !== 'Section') {
            console.warn(`Warning: Unknown type '${record.type}' for ID ${record.id}. Defaulting to Section if it has dots, Part otherwise.`);
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

    // Second pass: Build hierarchy based on 'type'
    for (const node of nodeMap.values()) {
        if (node.type === 'Part') {
            rootNodes.push(node);
        } else {
            // It is a Section, find its parent Part
            // Currently we still rely on ID pattern to find the parent ID
            // e.g. G.1 -> parent is G
            if (node.id.includes('.')) {
                const parts = node.id.split('.');
                const parentId = parts[0];
                const parent = nodeMap.get(parentId);
                if (parent) {
                    parent.children.push(node);
                } else {
                    console.warn(`Warning: Section ${node.id} has no parent Part ${parentId}`);
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
