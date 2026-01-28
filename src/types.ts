export interface Requirement {
    id: string;
    book: string;
    chapter: string;
    description: string;
    priority?: string; // "priority" column (MSCW)
    parent?: string; // "parent" column (ID of parent requirement)
    children?: Requirement[]; // Populated during generation
    referenceTo?: string; // "reference to" column
    attachedFiles?: string; // "attached files" column
}

export interface ParsedRequirements {
    requirements: Requirement[];
    books: Set<string>; // Unique books found
}
