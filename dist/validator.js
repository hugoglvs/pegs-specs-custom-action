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
        this.partSectionIndex = new Map();
        this.partPrefixMap = new Map();
    }
    validate(requirements, structure) {
        const result = { isValid: true, errors: [], warnings: [] };
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
    buildSectionIndex(structure) {
        for (const partNode of structure.parts) {
            // Map Part Name -> ID Prefix (e.g. "Goals Book" -> "G")
            this.partPrefixMap.set(partNode.title, partNode.id);
            const sectionMap = new Map();
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
    validateIDFormat(req, result) {
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
    validateNestingDepth(req, result) {
        // G.1.2 -> depth 3 (parts length)
        // We consider "G.1.2" as depth 1 relative to section? 
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
            // Support semicolon-separated list with optional path|caption syntax
            const items = req.attachedFiles.split(';').map(p => p.trim());
            for (const item of items) {
                if (!item)
                    continue;
                // Extract path (remove caption if present)
                const filePath = item.split('|')[0].trim();
                if (!fs.existsSync(filePath)) {
                    result.errors.push(`Requirement ${req.id}: Attached file '${filePath}' not found.`);
                    result.isValid = false;
                }
            }
        }
    }
    validateRequiredSections(requirements, structure, result) {
        const coveredNodeIds = new Set();
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
    checkNodeRequirement(node, coveredIds, result) {
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
exports.RequirementValidator = RequirementValidator;
