import { parseRequirements } from '../src/parser';
import { Structure } from '../src/structure';
import * as path from 'path';

describe('Parser', () => {
    // Mock Structure matching PEGS
    // Mock Structure matching PEGS
    const mockStructure: Structure = {
        parts: [
            {
                id: 'G', type: 'Part', title: 'Goals Book', description: 'desc', required: false, children: [
                    { id: 'G.1', type: 'Section', title: 'Context', description: 'desc', required: false, children: [] },
                    { id: 'G.2', type: 'Section', title: 'Current', description: 'desc', required: false, children: [] }
                ]
            }
        ],
        partMap: new Map([
            ['G', { id: 'G', type: 'Part', title: 'Goals Book', description: 'desc', required: false, children: [] }],
            ['G.1', { id: 'G.1', type: 'Section', title: 'Context', description: 'desc', required: false, children: [] }],
            ['G.2', { id: 'G.2', type: 'Section', title: 'Current', description: 'desc', required: false, children: [] }]
        ])
    };

    const fixturesDir = path.join(__dirname, 'fixtures');

    // We can use the actual requirements.csv from root for a quick integration test
    // or create a temp file. Let's use the actual file path but mock fs?
    // Actually, simpler to just point to the real requirements.csv if we trust its content,
    // OR create a temp CSV for this test.
    // Let's create a temp file using fs.writeFileSync in beforeAll/afterAll is messy.
    // We already have requirements.csv in root. Let's try to parse that if we know its content.
    // But better to isolate.

    // Actually, parseRequirements takes a filePath.
    // We can mock fs.createReadStream? Or just use a fixture file.

    // I'll create a local CSV file for testing.
    const testCsvPath = 'test_requirements.csv';

    const fs = require('fs');

    beforeAll(() => {
        const content = `id,description,priority\nG.1.1,Test Req,High\nG.2.1,Test Req 2,Low`;
        fs.writeFileSync(testCsvPath, content);
    });

    afterAll(() => {
        if (fs.existsSync(testCsvPath)) fs.unlinkSync(testCsvPath);
    });

    it('should infer Part and Section from ID', async () => {
        const result = await parseRequirements(testCsvPath, mockStructure);

        expect(result.requirements).toHaveLength(2);

        const r1 = result.requirements[0];
        expect(r1.id).toBe('G.1.1');
        expect(r1.part).toBe('Goals Book');
        expect(r1.section).toBe('Context');

        const r2 = result.requirements[1];
        expect(r2.id).toBe('G.2.1');
        expect(r2.part).toBe('Goals Book');
        expect(r2.section).toBe('Current');
    });

    it('should skip rows with unknown ID prefixes', async () => {
        const badCsv = 'bad_reqs.csv';
        const content = `id,description\nZ.1.1,Unknown Book`;
        fs.writeFileSync(badCsv, content);

        const result = await parseRequirements(badCsv, mockStructure);
        expect(result.requirements).toHaveLength(0); // Should skip Z.1.1

        fs.unlinkSync(badCsv);
    });
});
