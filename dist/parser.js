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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRequirements = parseRequirements;
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const core = __importStar(require("@actions/core"));
async function parseRequirements(filePath, structure) {
    const requirements = [];
    const parts = new Set();
    const parser = fs_1.default.createReadStream(filePath).pipe((0, csv_parse_1.parse)({
        columns: true,
        trim: true,
        skip_empty_lines: true,
    }));
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
        const req = {
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
