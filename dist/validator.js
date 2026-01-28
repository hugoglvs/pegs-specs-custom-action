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
exports.RequirementValidator = void 0;
const fs = __importStar(require("fs"));
class RequirementValidator {
    constructor() {
        this.bookChapterIndex = new Map();
        this.bookPrefixMap = new Map();
    }
    validate(requirements, structure) {
        const result = { isValid: true, errors: [], warnings: [] };
        this.buildChapterIndex(structure);
        // Build set of valid IDs for referential integrity
        const validIds = new Set(requirements.map(r => r.id));
        for (const req of requirements) {
            this.validateIDFormat(req, result);
            this.validateNestingDepth(req, result);
            this.validateParentExistence(req, validIds, result);
            this.validateAttachedFiles(req, result);
        }
        return result;
    }
    buildChapterIndex(structure) {
        for (const bookNode of structure.books) {
            // Map Book Name -> ID Prefix (e.g. "Goals Book" -> "G")
            this.bookPrefixMap.set(bookNode.title, bookNode.id);
            const chapterMap = new Map();
            for (const chapterNode of bookNode.children) {
                // ID: G.1 -> Number: 1
                const parts = chapterNode.id.split('.');
                if (parts.length >= 2) {
                    const num = parseInt(parts[1], 10);
                    chapterMap.set(chapterNode.title.toLowerCase().trim(), num);
                }
            }
            this.bookChapterIndex.set(bookNode.title, chapterMap);
        }
    }
    validateIDFormat(req, result) {
        // Regex: Letter.Num.Num...
        // e.g. G.1.2 or G.3.1.2.5
        const idPattern = /^[GEPS]\.\d+(\.\d+)*$/;
        if (!idPattern.test(req.id)) {
            result.errors.push(`Requirement ${req.id}: ID format invalid. Must be <Letter>.<Chapter>.<ID> (e.g., G.1.1).`);
            result.isValid = false;
            return;
        }
        const parts = req.id.split('.');
        const letter = parts[0];
        const chapterNum = parseInt(parts[1], 10);
        // Check consistency with Book
        const expectedLetter = this.bookPrefixMap.get(req.book);
        if (expectedLetter && letter !== expectedLetter) {
            result.errors.push(`Requirement ${req.id}: ID starts with '${letter}' but belongs to '${req.book}' (expected '${expectedLetter}').`);
            result.isValid = false;
        }
        // Check consistency with Chapter
        const bookChapters = this.bookChapterIndex.get(req.book);
        if (bookChapters) {
            const normalizedChapterTitle = req.chapter.toLowerCase().trim();
            const expectedChapterNum = bookChapters.get(normalizedChapterTitle);
            if (expectedChapterNum !== undefined && chapterNum !== expectedChapterNum) {
                result.errors.push(`Requirement ${req.id}: ID indicates chapter ${chapterNum} but belongs to chapter "${req.chapter}" (expected ${expectedChapterNum}).`);
                result.isValid = false;
            }
        }
        // Check Parent consistency
        if (req.parent) {
            if (!req.id.startsWith(req.parent + '.')) {
                result.errors.push(`Requirement ${req.id}: ID consistent with parent ${req.parent}. Child ID must start with Parent ID.`);
                result.isValid = false;
            }
        }
    }
    validateNestingDepth(req, result) {
        // G.1.2 -> depth 3 (parts length)
        // We consider "G.1.2" as depth 1 relative to chapter? 
        // Request: "warn if deep". Let's say max 6 parts (e.g. G.1.2.3.4.5)
        const parts = req.id.split('.');
        if (parts.length > 6) {
            result.warnings.push(`Requirement ${req.id}: Nesting is very deep (${parts.length} levels). Consider refactoring.`);
        }
    }
    validateParentExistence(req, validIds, result) {
        if (req.parent) {
            if (!validIds.has(req.parent)) {
                result.errors.push(`Requirement ${req.id}: Parent requirement '${req.parent}' not found. Top-level requirements should have an empty parent field.`);
                result.isValid = false;
            }
        }
    }
    validateAttachedFiles(req, result) {
        if (req.attachedFiles) {
            // Assume single file path or comma-separated
            const filePaths = req.attachedFiles.split(',').map(p => p.trim());
            for (const filePath of filePaths) {
                if (!filePath)
                    continue;
                if (!fs.existsSync(filePath)) {
                    result.errors.push(`Requirement ${req.id}: Attached file '${filePath}' not found.`);
                    result.isValid = false;
                }
            }
        }
    }
}
exports.RequirementValidator = RequirementValidator;
