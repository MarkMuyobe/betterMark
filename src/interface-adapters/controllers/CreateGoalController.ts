import { CreateGoal, CreateGoalRequest } from '../../application/use-cases/implementation/CreateGoal.js';

export class CreateGoalController {
    constructor(private useCase: CreateGoal) { }

    async handle(httpRequest: any): Promise<any> {
        try {
            const body = httpRequest.body;
            // Simple DTO mapping/validation could happen here or rely on use case
            const request: CreateGoalRequest = {
                title: body.title,
                description: body.description,
                facet: body.facet,
                difficulty: body.difficulty
            };

            const result = await this.useCase.execute(request);

            return {
                statusCode: 201,
                body: result
            };
        } catch (error: any) {
            return {
                statusCode: 400,
                body: { error: error.message }
            };
        }
    }
}
