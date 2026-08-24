import { Request, Response, NextFunction } from 'express';
import { SearchService } from './search.service';

export class SearchController {
  private searchService: SearchService;

  constructor() {
    this.searchService = new SearchService();
  }

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.query.q as string | undefined;

      if (!q || q.trim().length < 2) {
        res.status(200).json({
          status: 'success',
          statusCode: 200,
          data: {
            results: {
              customers: [],
              vehicles: [],
              jobCards: [],
              spareParts: [],
              users: [],
            },
          },
        });
        return;
      }

      const results = await this.searchService.search(q, req.user?.permissions ?? []);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: { results },
      });
    } catch (error) {
      next(error);
    }
  };
}
