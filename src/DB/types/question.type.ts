export enum QuestionType {
    MCQ = 'mcq',
    WRITING = 'writing',
}

export interface IMCQQuestion {
    type: QuestionType.MCQ;
    prompt: string;
    options: string[];
}

export interface IWritingQuestion {
    type: QuestionType.WRITING;
    prompt: string;
}

export type IQuestion = IMCQQuestion | IWritingQuestion;

export interface IMCQAnswer {
    type: QuestionType.MCQ;
    prompt: string;
    options: string[];
    selectedOption: string;
}

export interface IWritingAnswer {
    type: QuestionType.WRITING;
    prompt: string;
    text: string;
}

export type IAnswer = IMCQAnswer | IWritingAnswer;
