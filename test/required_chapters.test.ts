import { RequirementValidator } from '../src/validator';
import { Structure } from '../src/structure';
import { Requirement } from '../src/types';

describe('Required Chapters Validation', () => {
    const mockStructure: Structure = {
        parts: [
            {
                id: 'G', type: 'Part', title: 'Goals Book', description: 'desc', required: false, children: [
                    { id: 'G.1', type: 'Section', title: 'Context', description: 'desc', required: true, children: [] }, // Required
                    { id: 'G.2', type: 'Section', title: 'Current', description: 'desc', required: false, children: [] }  // Not Required
                ]
            }
        ],
        partMap: new Map() // Populate if needed by other checks, but required validation iterates parts array
    };
    // Populate partMap minimal for other checks to pass/skip
    mockStructure.partMap.set('G', mockStructure.parts[0]);
    mockStructure.partMap.set('G.1', mockStructure.parts[0].children[0]);
    mockStructure.partMap.set('G.2', mockStructure.parts[0].children[1]);

    const validator = new RequirementValidator();

    it('should fail if a required section is empty', () => {
        const requirements: Requirement[] = []; // No requirements
        const result = validator.validate(requirements, mockStructure);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing requirements for required section/part: Context (G.1)');
    });

    it('should pass if required section has requirements', () => {
        const requirements: Requirement[] = [
            { id: 'G.1.1', part: 'Goals Book', section: 'Context', description: 'd', priority: 'High' }
        ];
        const result = validator.validate(requirements, mockStructure);

        // It might fail other checks (like parent existence if not mocked properly), 
        // but we specifically check for the Missing requirements error NOT being there.
        // Or ensure minimal validity.
        // G.1.1 is valid ID. Part 'Goals Book' matches. Section 'Context' matches (if we set up index).
        // Let's rely on specific error check.

        const missingError = result.errors.find(e => e.includes('Missing requirements for required section/part'));
        expect(missingError).toBeUndefined();
    });

    it('should pass if non-required section is empty', () => {
        const requirements: Requirement[] = [
            { id: 'G.1.1', part: 'Goals Book', section: 'Context', description: 'd', priority: 'High' }
        ];
        // G.2 is empty, but required=false. Should not error for G.2.
        const result = validator.validate(requirements, mockStructure);

        const g2Error = result.errors.find(e => e.includes('G.2'));
        expect(g2Error).toBeUndefined();
    });
});
