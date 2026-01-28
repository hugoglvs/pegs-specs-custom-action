import { Requirement } from './types';
import { Structure } from './structure';
import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export class RequirementValidator {
    // Map<BookName, Map<ChapterNameNormalized, ChapterNumber>>
    private bookChapterIndex: Map<string, Map<string, number>>;
    // Map Book Name -> Book ID Prefix (e.g. "Goals Book" -> "G")
    private bookPrefixMap: Map<string, string>;

    constructor() {
        this.bookChapterIndex = new Map();
        this.bookPrefixMap = new Map();
    }

    public validate(requirements: Requirement[], structure: Structure): ValidationResult {
        const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

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

    private buildChapterIndex(structure: Structure) {
        for (const bookNode of structure.books) {
            // Map Book Name -> ID Prefix (e.g. "Goals Book" -> "G")
            this.bookPrefixMap.set(bookNode.title, bookNode.id);

            const chapterMap = new Map<string, number>();

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

    private validateIDFormat(req: Requirement, result: ValidationResult) {
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

    private validateNestingDepth(req: Requirement, result: ValidationResult) {
        // G.1.2 -> depth 3 (parts length)
        // We consider "G.1.2" as depth 1 relative to chapter? 
        // Request: "warn if deep". Let's say max 6 parts (e.g. G.1.2.3.4.5)

        const parts = req.id.split('.');
        if (parts.length > 6) {
            result.warnings.push(`Requirement ${req.id}: Nesting is very deep (${parts.length} levels). Consider refactoring.`);
        }
    }

    private validateParentExistence(req: Requirement, validIds: Set<string>, result: ValidationResult) {
        if (req.parent) {
            if (!validIds.has(req.parent)) {
                result.errors.push(`Requirement ${req.id}: Parent requirement '${req.parent}' not found. Top-level requirements should have an empty parent field.`);
                result.isValid = false;
            }
        }
    }

    private validateAttachedFiles(req: Requirement, result: ValidationResult) {
        if (req.attachedFiles) {
            // Assume single file path or comma-separated
            const filePaths = req.attachedFiles.split(',').map(p => p.trim());
            for (const filePath of filePaths) {
                if (!filePath) continue;
                if (!fs.existsSync(filePath)) {
                    result.errors.push(`Requirement ${req.id}: Attached file '${filePath}' not found.`);
                    result.isValid = false;
                }
            }
        }
    }
}
