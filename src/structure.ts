import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

export interface StructureNode {
    id: string;      // e.g., "G", "G.1"
    title: string;
    description: string;
    required: boolean; // New field
    children: StructureNode[];
}

export interface Structure {
    books: StructureNode[];
    bookMap: Map<string, StructureNode>; // Map ID -> Node
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
                // Handle boolean string or empty
                return value.toLowerCase() === 'true';
            }
            return value;
        }
    }) as { id: string; title: string; description: string; required: any }[];

    const rootNodes: StructureNode[] = [];
    const nodeMap = new Map<string, StructureNode>();

    // First pass: Create all nodes
    for (const record of records) {
        const node: StructureNode = {
            id: record.id,
            title: record.title,
            description: record.description,
            required: !!record.required,
            children: []
        };
        nodeMap.set(record.id, node);
    }

    // Second pass: Build hierarchy
    // PEGS hierarchy is flat-ish: Book -> Chapter.
    // IDs: "G" (Book), "G.1" (Chapter)

    // Sort keys to ensure parents processed before children if we were strictly hierarchical,
    // but here we just map based on ID pattern.

    for (const node of nodeMap.values()) {
        if (node.id.includes('.')) {
            // It's likely a chapter (e.g. G.1)
            const parts = node.id.split('.');
            const parentId = parts[0]; // e.g. G

            const parent = nodeMap.get(parentId);
            if (parent) {
                parent.children.push(node);
            } else {
                // Orphan chapter or malformed ID? 
                // For now, treat as root or throw? 
                // Let's assume valid PEGS structure for now.
                console.warn(`Warning: Chapter ${node.id} has no parent book ${parentId}`);
            }
        } else {
            // It's a book (e.g. G)
            rootNodes.push(node);
        }
    }

    return {
        books: rootNodes,
        bookMap: nodeMap
    };
}
