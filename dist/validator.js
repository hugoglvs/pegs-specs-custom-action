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
const path = __importStar(require("path"));
class RequirementValidator {
    constructor(templatesPath) {
        this.templatesPath = templatesPath;
        this.bookChapterIndex = new Map();
    }
    async validate(requirements) {
        const result = { isValid: true, errors: [], warnings: [] };
        await this.buildChapterIndex();
        for (const req of requirements) {
            this.validateIDFormat(req, result);
            this.validateNestingDepth(req, result);
        }
        return result;
    }
    async buildChapterIndex() {
        // Known PEGS books and valid prefixes
        const bookFiles = new Map([
            ['Goals Book', { file: 'goals.adoc', letter: 'G' }],
            ['Environment Book', { file: 'environment.adoc', letter: 'E' }],
            ['Project Book', { file: 'project.adoc', letter: 'P' }],
            ['System Book', { file: 'system.adoc', letter: 'S' }]
        ]);
        for (const [bookName, info] of bookFiles.entries()) {
            const templatePath = path.join(this.templatesPath, info.file);
            if (!fs.existsSync(templatePath))
                continue;
            const content = await fs.promises.readFile(templatePath, 'utf-8');
            const chapterMap = new Map();
            const lines = content.split('\n');
            for (const line of lines) {
                // Match "== G.1 Context..."
                const match = line.match(/^==\s+([A-Z])\.(\d+)\s+(.+)$/);
                if (match) {
                    const chapterNum = parseInt(match[2], 10);
                    const chapterTitle = match[3].trim();
                    chapterMap.set(chapterTitle.toLowerCase(), chapterNum);
                }
            }
            this.bookChapterIndex.set(bookName, chapterMap);
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
        const bookLetterMap = {
            'Goals Book': 'G',
            'Environment Book': 'E',
            'Project Book': 'P',
            'System Book': 'S'
        };
        const expectedLetter = bookLetterMap[req.book];
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
}
exports.RequirementValidator = RequirementValidator;
