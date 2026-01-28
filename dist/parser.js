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
async function parseRequirements(filePath) {
    const requirements = [];
    const books = new Set();
    const parser = fs_1.default.createReadStream(filePath).pipe((0, csv_parse_1.parse)({
        columns: true,
        trim: true,
        skip_empty_lines: true,
    }));
    for await (const record of parser) {
        // Validate schema loosely (keys might differ slightly case-wise, so we normalize or expect exact headers)
        // Expected headers: id, book, chapter, description, reference to, attached files
        // Check if required fields exist
        if (!record['id'] || !record['book'] || !record['chapter'] || !record['description']) {
            core.warning(`Skipping invalid row: ${JSON.stringify(record)}`);
            continue;
        }
        const req = {
            id: record['id'],
            book: record['book'],
            chapter: record['chapter'],
            description: record['description'],
            priority: record['priority'],
            parent: record['parent'],
            referenceTo: record['reference to'] || record['reference_to'], // handle both for robustness
            attachedFiles: record['attached files'] || record['attached_files'],
        };
        requirements.push(req);
        books.add(req.book);
    }
    return { requirements, books };
}
