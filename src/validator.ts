import { Requirement } from './types';
import { Structure, StructureNode } from './structure';
import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export class RequirementValidator {
    // Map<PartName, Map<SectionNameNormalized, SectionNumber>>
    private partSectionIndex: Map<string, Map<string, number>>;
    // Map Part Name -> Part ID Prefix (e.g. "Goals Book" -> "G")
    private partPrefixMap: Map<string, string>;

    constructor() {
        this.partSectionIndex = new Map();
        this.partPrefixMap = new Map();
    }

    public validate(requirements: Requirement[], structure: Structure): ValidationResult {
        const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

        this.buildSectionIndex(structure);

        // Build set of valid IDs for referential integrity
        const validIds = new Set(requirements.map(r => r.id));

        for (const req of requirements) {
            this.validateIDFormat(req, result);
            this.validateNestingDepth(req, result);
            this.validateParentExistence(req, validIds, result);
            this.validateAttachedFiles(req, result);
        }

        this.validateRequiredSections(requirements, structure, result);

        return result;
    }

    private buildSectionIndex(structure: Structure) {
        for (const partNode of structure.parts) {
            // Map Part Name -> ID Prefix (e.g. "Goals Book" -> "G")
            this.partPrefixMap.set(partNode.title, partNode.id);

            const sectionMap = new Map<string, number>();

            for (const sectionNode of partNode.children) {
                // ID: G.1 -> Number: 1
                const parts = sectionNode.id.split('.');
                if (parts.length >= 2) {
                    const num = parseInt(parts[1], 10);
                    sectionMap.set(sectionNode.title.toLowerCase().trim(), num);
                }
            }
            this.partSectionIndex.set(partNode.title, sectionMap);
        }
    }

    private validateIDFormat(req: Requirement, result: ValidationResult) {
        // Regex: Letter(s).Num.Num...
        // Allows any prefix of uppercase letters, followed by DOT then digits.
        const idPattern = /^[A-Z]+\.\d+(\.\d+)*$/;

        if (!idPattern.test(req.id)) {
            result.errors.push(`Requirement ${req.id}: ID format invalid. Must be <Letter>.<Section>.<ID> (e.g., G.1.1).`);
            result.isValid = false;
            return;
        }

        const parts = req.id.split('.');
        const letter = parts[0];
        const sectionNum = parseInt(parts[1], 10);

        // Check consistency with Part
        const expectedLetter = this.partPrefixMap.get(req.part);

        if (expectedLetter && letter !== expectedLetter) {
            result.errors.push(`Requirement ${req.id}: ID starts with '${letter}' but belongs to '${req.part}' (expected '${expectedLetter}').`);
            result.isValid = false;
        }

        // Check consistency with Section
        const partSections = this.partSectionIndex.get(req.part);
        if (partSections) {
            const normalizedSectionTitle = req.section.toLowerCase().trim();
            const expectedSectionNum = partSections.get(normalizedSectionTitle);

            if (expectedSectionNum !== undefined && sectionNum !== expectedSectionNum) {
                result.errors.push(`Requirement ${req.id}: ID indicates section ${sectionNum} but belongs to section "${req.section}" (expected ${expectedSectionNum}).`);
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
        // We consider "G.1.2" as depth 1 relative to section? 
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
            // Support semicolon-separated list with optional path|caption syntax
            const items = req.attachedFiles.split(';').map(p => p.trim());
            for (const item of items) {
                if (!item) continue;

                // Extract path (remove caption if present)
                const filePath = item.split('|')[0].trim();

                if (!fs.existsSync(filePath)) {
                    result.errors.push(`Requirement ${req.id}: Attached file '${filePath}' not found.`);
                    result.isValid = false;
                }
            }
        }
    }

    private validateRequiredSections(requirements: Requirement[], structure: Structure, result: ValidationResult): void {
        const coveredNodeIds = new Set<string>();

        for (const req of requirements) {
            const parts = req.id.split('.');
            if (parts.length >= 2) {
                // G.1
                coveredNodeIds.add(`${parts[0]}.${parts[1]}`);
                // Also G? Generally strict validation on sections implies parts are covered too.
                coveredNodeIds.add(parts[0]);
            }
        }

        for (const node of structure.parts) {
            this.checkNodeRequirement(node, coveredNodeIds, result);
        }
    }

    private checkNodeRequirement(node: StructureNode, coveredIds: Set<string>, result: ValidationResult) {
        if (node.required) {
            if (!coveredIds.has(node.id)) {
                // No requirement found that matches this node ID (e.g. G.1.x)
                result.errors.push(`Missing requirements for required section/part: ${node.title} (${node.id})`);
                result.isValid = false;
            }
        }

        if (node.children) {
            for (const child of node.children) {
                this.checkNodeRequirement(child, coveredIds, result);
            }
        }
    }
}

