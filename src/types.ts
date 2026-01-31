export interface Requirement {
    id: string;
    part: string;    // Renamed from book
    section: string; // Renamed from chapter
    description: string;
    priority?: string; // "priority" column (MSCW)
    parent?: string; // "parent" column (ID of parent requirement)
    children?: Requirement[]; // Populated during generation
    referenceTo?: string; // "reference to" column
    attachedFiles?: string; // "attached files" column
}

export interface ParsedRequirements {
    requirements: Requirement[];
    parts: Set<string>; // Renamed from books
}
