
import { Options } from './../../node_modules/raw-body/index.d';

export class ApplicationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number,Options?:Options) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, ApplicationError.prototype);
    }

}
export interface IError extends Error {
    statusCode: number;
}


export class ValidationError extends ApplicationError {
    constructor(message: string) {
        super(message, 422);
    }
}

export class InvalidTokenException extends ApplicationError{
    constructor(message:string){
        super(message,409)
    }
}
export class EmailIsExistException extends ApplicationError{
    constructor(message:string='email already exist'){  
        super(message,400)
    }
}  
export class NotFoundException extends ApplicationError{
    constructor(message:string){
        super(message,404)
    }
}
export class ExpiredOTPException extends ApplicationError{
    constructor(message:string){
        super(message,410)
    }
}
export class InvalidCredentialsException extends ApplicationError{
    constructor(message:string='invalid credentials'){
        super(message,409)
    }
}
export class NotConfirmedException extends ApplicationError{
    constructor(message:string='confirm your email first'){
        super(message,400)
    }
}
export class FileUploadException extends ApplicationError{
    constructor(message='file upload error'){
        super(message,400)
    }
}
export class BadRequestException extends ApplicationError{
    constructor(message:string){
        super(message,500)
    }
}