# Project Setup Plan: NestJS, ESLint, Prettier, and Advanced Practices

This document outlines the steps to set up a professional NestJS project with best practices for logging, formatting, and code quality.

---

## Phase 1: Core NestJS Application Setup
This phase gets a basic, runnable NestJS server going inside your existing structure.

### 1. Install NestJS Dependencies
We'll add the essential building blocks for a NestJS application to `apps/server/package.json`.

```bash
bun add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata
```

*   `@nestjs/common`: NestJS fundamental building blocks like modules, controllers, providers, etc.
*   `@nestjs/core`: The core NestJS runtime.
*   `@nestjs/platform-express`: The default HTTP platform for NestJS, built on Express.
*   `reflect-metadata`: A polyfill for the ES7 Reflect Metadata API, required by NestJS for TypeScript decorators.

### 2. Configure TypeScript for NestJS
NestJS uses decorators heavily, which requires specific settings in the `tsconfig.json` file. We will update `apps/server/tsconfig.json`.

Add the following to the `compilerOptions`:
```json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    // ... other options
  }
}
```
*   `emitDecoratorMetadata`: Enables metadata emission for decorators.
*   `experimentalDecorators`: Enables experimental support for ES decorators.

### 3. Create the Core Application Files
We will create the standard entry point files for a NestJS application in `apps/server/src/`.

*   **`apps/server/src/main.ts`**: The bootstrap file that starts the server.
    ```typescript
    import { NestFactory } from '@nestjs/core';
    import { AppModule } from './app.module';

    async function bootstrap() {
      const app = await NestFactory.create(AppModule);
      await app.listen(3000); // Or any desired port
    }
    bootstrap();
    ```
*   **`apps/server/src/app.module.ts`**: The root module of the application.
    ```typescript
    import { Module } from '@nestjs/common';
    import { AppController } from './app.controller';
    import { AppService } from './app.service';

    @Module({
      imports: [],
      controllers: [AppController],
      providers: [AppService],
    })
    export class AppModule {}
    ```
*   **`apps/server/src/app.controller.ts`**: A simple controller to handle incoming web requests.
    ```typescript
    import { Controller, Get } from '@nestjs/common';
    import { AppService } from './app.service';

    @Controller()
    export class AppController {
      constructor(private readonly appService: AppService) {}

      @Get()
      getHello(): string {
        return this.appService.getHello();
      }
    }
    ```
*   **`apps/server/src/app.service.ts`**: A service to contain business logic.
    ```typescript
    import { Injectable } from '@nestjs/common';

    @Injectable()
    export class AppService {
      getHello(): string {
        return 'Hello World from NestJS!';
      }
    }
    ```

### 4. Bootstrap the Application
Modify `apps/server/index.ts` to import and run `main.ts`.

```typescript
// apps/server/index.ts
import './src/main'; // This will execute main.ts and start the NestJS app
```
We also need to update the `dev` script in `apps/server/package.json` to point to `main.ts` (or simply remove it if `index.ts` handles the bootstrapping).
```json
{
  "scripts": {
    "dev": "bun run --env-file=../../.env.local src/main.ts"
  }
}
```

---

## Phase 2: Implementing Essential Tooling (Logging, Linting, Formatting)

### 5. Setup NestJS Logging
Learn to use the powerful built-in `Logger`. We'll see how to add context to your logs and why structured logging is crucial for production applications.

*   **Install NestJS Logger:** NestJS uses `winston` or `pino` for more advanced logging, but the default `Logger` is good for starters. No extra installation is needed for the default logger.
*   **Using the Logger:**
    ```typescript
    import { Injectable, Logger } from '@nestjs/common';

    @Injectable()
    export class AppService {
      private readonly logger = new Logger(AppService.name); // Contextual logger

      getHello(): string {
        this.logger.log('Getting a "Hello World" message.');
        return 'Hello World from NestJS!';
      }
    }
    ```
*   **Explanation:** Using a contextual logger (by passing `AppService.name`) helps identify where log messages originate, which is invaluable for debugging.

### 6. Install ESLint & Prettier
ESLint finds code bugs and enforces best practices, while Prettier keeps your code style consistent. They work together. We'll install these as dev dependencies in the root `package.json`.

```bash
bun add -D eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier eslint-plugin-prettier
```

*   `eslint`: The core ESLint library.
*   `prettier`: The code formatter.
*   `@typescript-eslint/parser`: Allows ESLint to parse TypeScript code.
*   `@typescript-eslint/eslint-plugin`: Provides ESLint rules specific to TypeScript.
*   `eslint-config-prettier`: Turns off all ESLint rules that might conflict with Prettier.
*   `eslint-plugin-prettier`: Runs Prettier as an ESLint rule, reporting differences as ESLint issues.

### 7. Configure ESLint and Prettier
Create configuration files in the root directory.

*   **`.eslintrc.js`**:
    ```javascript
    module.exports = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: 'tsconfig.json', // Point to your main tsconfig.json
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint/eslint-plugin'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended', // Integrates Prettier with ESLint
      ],
      root: true,
      env: {
        node: true,
        jest: true,
      },
      ignorePatterns: ['.eslintrc.js', 'dist/*', 'node_modules/*', 'bun.lock'],
      rules: {
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    };
    ```
*   **`.prettierrc`**:
    ```json
    {
      "singleQuote": true,
      "trailingComma": "all",
      "arrowParens": "always",
      "semi": true,
      "printWidth": 100
    }
    ```
    (Adjust rules to your team's preference. `singleQuote` and `trailingComma` are common for TypeScript/JavaScript.)

### 8. Add Scripts to `package.json`
Add these scripts to the root `package.json` for easy access.

```json
{
  "scripts": {
    "lint": "eslint "{./apps,./packages}/**/*.ts" --fix",
    "format": "prettier --write "{./apps,./packages}/**/*.ts""
  }
}
```
*   `lint`: Runs ESLint on all `.ts` files in `apps` and `packages` directories and tries to fix issues.
*   `format`: Runs Prettier to reformat all `.ts` files in `apps` and `packages` directories according to `.prettierrc`.

---

## Phase 3: Advancing to Senior-Level Practices
Once the foundation is solid, here are the next steps I recommend to make this project truly production-ready.

### 9. Configuration Management (`@nestjs/config`)
Stop using hardcoded values. Implement a system to manage environment variables for different environments (dev, production).

*   **Install:**
    ```bash
    bun add @nestjs/config
    ```
*   **Usage:** Create a `.env` file (e.g., in the project root or `apps/server`). Load it in `AppModule`.
    ```typescript
    // apps/server/src/app.module.ts
    import { Module } from '@nestjs/common';
    import { ConfigModule } from '@nestjs/config'; // Import ConfigModule
    // ... other imports

    @Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true, // Makes the ConfigModule available everywhere
        }),
      ],
      controllers: [AppController],
      providers: [AppService],
    })
    export class AppModule {}
    ```
    Then, you can inject `ConfigService` into any service to access environment variables.
    ```typescript
    // apps/server/src/app.service.ts
    import { Injectable, Logger } from '@nestjs/common';
    import { ConfigService } from '@nestjs/config'; // Import ConfigService

    @Injectable()
    export class AppService {
      private readonly logger = new Logger(AppService.name);

      constructor(private configService: ConfigService) {
        const port = this.configService.get<string>('PORT');
        this.logger.log(`Application running on port: ${port}`);
      }

      getHello(): string {
        return 'Hello World from NestJS!';
      }
    }
    ```

### 10. Automated Validation (`class-validator` & `class-transformer`)
Protect your application by automatically validating incoming data (e.g., from API requests).

*   **Install:**
    ```bash
    bun add class-validator class-transformer
    bun add -D @types/class-transformer @types/class-validator
    ```
*   **Configure TypeScript:** Add `"emitDecoratorMetadata": true` and `"experimentalDecorators": true` to your `tsconfig.json` (if not already done).
*   **Usage:** Create DTOs (Data Transfer Objects) for incoming data.
    ```typescript
    // apps/server/src/dto/create-item.dto.ts
    import { IsString, IsInt, Min, MaxLength } from 'class-validator';

    export class CreateItemDto {
      @IsString()
      @MaxLength(20)
      name: string;

      @IsInt()
      @Min(0)
      quantity: number;
    }
    ```
    Apply it in a controller:
    ```typescript
    // apps/server/src/app.controller.ts
    import { Controller, Get, Post, Body, UsePipes, ValidationPipe } from '@nestjs/common';
    import { AppService } from './app.service';
    import { CreateItemDto } from './dto/create-item.dto'; // Import your DTO

    @Controller()
    export class AppController {
      constructor(private readonly appService: AppService) {}

      @Get()
      getHello(): string {
        return this.appService.getHello();
      }

      @Post('item')
      @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) // Apply validation pipe
      createItem(@Body() createItemDto: CreateItemDto) {
        // If validation passes, createItemDto will be a valid instance
        console.log(createItemDto);
        return 'Item created successfully!';
      }
    }
    ```
    *   `whitelist: true`: Removes properties that are not defined in the DTO.
    *   `forbidNonWhitelisted: true`: Throws an error if non-whitelisted properties are sent.

### 11. API Documentation (`@nestjs/swagger`)
Automatically generate professional, interactive API documentation (OpenAPI/Swagger UI) directly from your code.

*   **Install:**
    ```bash
    bun add @nestjs/swagger swagger-ui-express
    bun add -D @types/swagger-ui-express
    ```
*   **Setup:**
    ```typescript
    // apps/server/src/main.ts
    import { NestFactory } from '@nestjs/core';
    import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // Import Swagger modules
    import { AppModule } from './app.module';

    async function bootstrap() {
      const app = await NestFactory.create(AppModule);

      const config = new DocumentBuilder()
        .setTitle('Discus API')
        .setDescription('The Discus API description')
        .setVersion('1.0')
        .addTag('discus')
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document); // 'api' is the endpoint for Swagger UI

      await app.listen(3000);
    }
    bootstrap();
    ```
*   **Decorate DTOs/Controllers:** Use `@ApiProperty()` in your DTOs and other decorators in controllers for richer documentation.
    ```typescript
    // apps/server/src/dto/create-item.dto.ts
    import { IsString, IsInt, Min, MaxLength } from 'class-validator';
    import { ApiProperty } from '@nestjs/swagger'; // Import ApiProperty

    export class CreateItemDto {
      @ApiProperty({ description: 'The name of the item', example: 'Widget' })
      @IsString()
      @MaxLength(20)
      name: string;

      @ApiProperty({ description: 'The quantity of the item', example: 10 })
      @IsInt()
      @Min(0)
      quantity: number;
    }
    ```

### 12. Pre-commit Hooks (`husky` & `lint-staged`)
Guarantee that no poorly formatted or lint-breaking code ever gets committed.

*   **Install:**
    ```bash
    bun add -D husky lint-staged
    ```
*   **Initialize Husky:**
    ```bash
    bun husky install
    ```
*   **Add Pre-commit Hook:**
    ```bash
    bun husky add .husky/pre-commit "bun lint-staged"
    ```
*   **Configure `lint-staged` in `package.json`**:
    ```json
    {
      "lint-staged": {
        "*.{ts,js,json,md}": [
          "prettier --write",
          "eslint --fix"
        ]
      }
    }
    ```
    This configuration tells `lint-staged` to run `prettier --write` and `eslint --fix` on staged `.ts`, `.js`, `.json`, and `.md` files before a commit. This ensures that only properly formatted and linted code gets committed.

---

## Phase 4: Shared Packages Setup (Logger and Monads)
This phase focuses on creating shared packages that can be used across the entire monorepo.

### 13. Create a Shared Logger Package (`packages/logger`)
We'll create a dedicated package for logging to ensure consistent logging practices across the monorepo.

*   **Create `package.json` for `@discus/logger`**:
    ```json
    {
      "name": "@discus/logger",
      "version": "1.0.0",
      "description": "Shared logger package for Discus monorepo",
      "main": "index.ts",
      "scripts": {
        "test": "echo \"Error: no test specified\" && exit 1"
      },
      "keywords": [],
      "author": "",
      "license": "ISC",
      "dependencies": {
        "@nestjs/common": "^10.0.0"
      }
    }
    ```
*   **Create `tsconfig.json` for `@discus/logger`**:
    ```json
    {
      "compilerOptions": {
        "module": "commonjs",
        "declaration": true,
        "removeComments": true,
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true,
        "allowSyntheticDefaultImports": true,
        "target": "es2017",
        "sourceMap": true,
        "outDir": "./dist",
        "baseUrl": "./",
        "incremental": true,
        "skipLibCheck": true,
        "strictNullChecks": false,
        "noImplicitAny": false,
        "strictBindCallApply": false,
        "forceConsistentCasingInFileNames": false,
        "noFallthroughCasesInSwitch": false
      },
      "include": ["./**/*"]
    }
    ```
*   **Create `index.ts` for `@discus/logger`**:
    ```typescript
    import { LoggerService } from '@nestjs/common';

    export class AppLogger implements LoggerService {
      log(message: string) {
        console.log(message);
      }
      error(message: string, trace: string) {
        console.error(message, trace);
      }
      warn(message: string) {
        console.warn(message);
      }
      debug(message: string) {
        console.debug(message);
      }
      verbose(message: string) {
        console.log(message);
      }
    }
    ```

### 14. Create a Functional Programming (FP) Package for Monads (`packages/fp`)
A dedicated package for functional programming utilities, including monads, to be used across all packages and apps.

*   **Create `package.json` for `@discus/fp`**:
    ```json
    {
      "name": "@discus/fp",
      "version": "1.0.0",
      "description": "Functional programming utilities, including monads, for Discus monorepo",
      "main": "index.ts",
      "scripts": {
        "test": "echo \"Error: no test specified\" && exit 1"
      },
      "keywords": [],
      "author": "",
      "license": "ISC"
    }
    ```
*   **Create `tsconfig.json` for `@discus/fp`**:
    ```json
    {
      "compilerOptions": {
        "module": "commonjs",
        "declaration": true,
        "removeComments": true,
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true,
        "allowSyntheticDefaultImports": true,
        "target": "es2017",
        "sourceMap": true,
        "outDir": "./dist",
        "baseUrl": "./",
        "incremental": true,
        "skipLibCheck": true,
        "strictNullChecks": false,
        "noImplicitAny": false,
        "strictBindCallApply": false,
        "forceConsistentCasingInFileNames": false,
        "noFallthroughCasesInSwitch": false
      },
      "include": ["./**/*"]
    }
    ```
*   **Create `index.ts` for `@discus/fp` (Basic `Maybe` Monad example)**:
    ```typescript
    export abstract class Maybe<T> {
      abstract map<U>(f: (value: T) => U): Maybe<U>;
      abstract flatMap<U>(f: (value: T) => Maybe<U>): Maybe<U>;
      abstract getOrElse(defaultValue: T): T;

      static fromNullable<T>(value: T | null | undefined): Maybe<T> {
        return value === null || value === undefined ? new Nothing() : new Just(value);
      }
    }

    export class Just<T> extends Maybe<T> {
      constructor(private value: T) {
        super();
      }

      map<U>(f: (value: T) => U): Maybe<U> {
        return new Just(f(this.value));
      }

      flatMap<U>(f: (value: T) => Maybe<U>): Maybe<U> {
        return f(this.value);
      }

      getOrElse(defaultValue: T): T {
        return this.value;
      }
    }

    export class Nothing<T> extends Maybe<T> {
      map<U>(f: (value: T) => U): Maybe<U> {
        return new Nothing<U>();
      }

      flatMap<U>(f: (value: T) => Maybe<U>): Maybe<U> {
        return new Nothing<U>();
      }

      getOrElse(defaultValue: T): T {
        return defaultValue;
      }
    }
    ```

### 15. Update Root `package.json` for Workspace Linking
Add the new packages to the `workspaces` array in the root `package.json` and then install dependencies.

*   **Modify `package.json`**:
    ```json
    {
      "name": "discus",
      "module": "index.ts",
      "type": "module",
      "scripts": {
        "dev": "bun run --env-file=.env.local apps/server/index.ts",
        "lint": "eslint "{./apps,./packages}/**/*.ts" --fix",
        "format": "prettier --write "{./apps,./packages}/**/*.ts""
      },
      "devDependencies": {
        "@types/bun": "latest",
        "@typescript-eslint/eslint-plugin": "^6.18.1",
        "@typescript-eslint/parser": "^6.18.1",
        "eslint": "^8.56.0",
        "eslint-config-prettier": "^9.1.0",
        "eslint-plugin-prettier": "^5.1.3",
        "prettier": "^3.2.4",
        "husky": "^8.0.3",
        "lint-staged": "^15.2.0"
      },
      "peerDependencies": {
        "typescript": "^5.0.0"
      },
      "workspaces": [
        "apps/*",
        "packages/*"
      ]
    }
    ```
*   **Install Dependencies**:
    ```bash
    bun install
    ```
    This command will hoist common dependencies and link the workspace packages correctly.
