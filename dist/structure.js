"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadStructure = loadStructure;
const fs = __importStar(require("fs"));
const sync_1 = require("csv-parse/sync");
function loadStructure(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Structure file not found at ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = (0, sync_1.parse)(content, {
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
    });
    const rootNodes = [];
    const nodeMap = new Map();
    // First pass: Create all nodes
    for (const record of records) {
        const node = {
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
            }
            else {
                // Orphan chapter or malformed ID? 
                // For now, treat as root or throw? 
                // Let's assume valid PEGS structure for now.
                console.warn(`Warning: Chapter ${node.id} has no parent book ${parentId}`);
            }
        }
        else {
            // It's a book (e.g. G)
            rootNodes.push(node);
        }
    }
    return {
        books: rootNodes,
        bookMap: nodeMap
    };
}
