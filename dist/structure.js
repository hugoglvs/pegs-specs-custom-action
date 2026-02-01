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
                return value.toLowerCase() === 'true';
            }
            return value;
        }
    });
    const rootNodes = [];
    const nodeMap = new Map();
    // First pass: Create all nodes
    for (const record of records) {
        // Robust type handling
        let rawType = (record.type || '').trim().toLowerCase();
        let type;
        if (rawType === 'part') {
            type = 'Part';
        }
        else if (rawType === 'section') {
            type = 'Section';
        }
        else {
            // Defaulting logic: Section if it has dots, Part otherwise
            type = record.id.includes('.') ? 'Section' : 'Part';
            console.warn(`Warning: Unknown type '${record.type}' for ID ${record.id}. Defaulting to ${type}.`);
        }
        const node = {
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
        }
        else {
            // It is a Section, find its parent
            if (node.id.includes('.')) {
                const idSegments = node.id.split('.');
                // Parent ID is the ID without the last segment
                const parentId = idSegments.slice(0, -1).join('.');
                const parent = nodeMap.get(parentId);
                if (parent) {
                    parent.children.push(node);
                }
                else {
                    // Fallback to the first segment as part if intermediate parent not found
                    const rootPartId = idSegments[0];
                    const rootPart = nodeMap.get(rootPartId);
                    if (rootPart) {
                        rootPart.children.push(node);
                    }
                    else {
                        console.warn(`Warning: Section ${node.id} has no valid parent in structure`);
                    }
                }
            }
            else {
                console.warn(`Warning: Section ${node.id} has no parent indicator in ID`);
            }
        }
    }
    return {
        parts: rootNodes,
        partMap: nodeMap
    };
}
