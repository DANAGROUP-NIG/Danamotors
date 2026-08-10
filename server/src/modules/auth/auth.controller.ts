import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        roleName,
        branchName,
      } = req.body;
      const result = await this.authService.register({
        email,
        passwordHash: password,
        firstName,
        lastName,
        phoneNumber,
        roleName,
        branchName,
      });

      res.status(201).json({
        status: "success",
        statusCode: 201,
        message: "User registered successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await this.authService.login(
        { email, passwordHash: password },
        { ipAddress, userAgent },
      );

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const result = await this.authService.refresh(refreshToken);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      await this.authService.logout(refreshToken);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  logoutAll = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      await this.authService.logoutAll(userId);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Logged out from all devices successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  getMe = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const result = await this.authService.getMe(userId);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        data: {
          user: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const result = await this.authService.updateMe(userId, req.body);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Profile updated successfully",
        data: {
          user: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.authService.forgotPassword(req.body.email);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: result
          ? "Password reset link generated"
          : "If an account exists for that email, a reset link will be sent",
        data: result ?? undefined,
      });
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.authService.resetPassword(req.body.token, req.body.newPassword);

      res.status(200).json({
        status: "success",
        statusCode: 200,
        message: "Password reset successfully. You can now sign in.",
      });
    } catch (error) {
      next(error);
    }
  };
}
export default AuthController;
