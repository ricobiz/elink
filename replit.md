# EIROS LINK - AI Assistant with Human-like Browser Automation

## Overview

EIROS LINK is a comprehensive AI Assistant platform that combines advanced artificial intelligence capabilities with sophisticated human-like browser automation. The system uses Link Language (URL-based commands) to control web browsers through AI agents while providing natural language interactions, media processing, speech recognition, and real-time communication features. It bridges the gap between AI conversation and deterministic browser actions, offering a complete automation solution with human-like behavior patterns to bypass bot detection.

The platform integrates multiple AI services (OpenAI, Anthropic, Google Cloud), advanced media processing, WebRTC communication, and sophisticated browser automation using realistic mouse movements, natural typing patterns, and stealth capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent design
- **Styling**: Tailwind CSS with custom design tokens and dark theme support
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Updates**: Server-Sent Events (SSE) for live event streaming

### Backend Architecture
- **Framework**: Express.js with TypeScript for the API server
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Database Provider**: Neon serverless PostgreSQL with connection pooling
- **Link Language Parser**: Custom service for parsing URL-based commands into structured operations
- **Session Management**: Database-backed session management with automatic expiry and cleanup
- **Event Logging**: Comprehensive event tracking for all operations with correlation IDs

### Data Storage Design
- **Sessions Table**: Manages browser automation sessions with status tracking and expiration
- **Events Table**: Logs all Link Language operations with request/response data and timing metrics
- **Artifacts Table**: Stores generated files like screenshots and automation outputs
- **LLM Logs Table**: Tracks AI model interactions with usage metrics and costs
- **Coordinate State Table**: Manages staged coordinate inputs for complex browser interactions

### Browser Automation Integration
- **Human-like Automation**: Advanced Playwright integration with realistic human behavior
- **Stealth Capabilities**: Anti-detection browser automation using fingerprint masking
- **Realistic Mouse Movements**: Bezier curve-based natural cursor movements
- **Natural Typing Patterns**: Human-like typing with mistakes, corrections, and realistic delays
- **MCP Client**: Integration with Model Context Protocol for browser automation tools
- **Context Management**: Persistent browser sessions with human behavior profiles

### Link Language Protocol
- **Path-based Commands**: All operations expressed as URL paths without query parameters
- **Session Routing**: Commands routed to specific browser sessions via session IDs
- **Coordinate System**: Staging-based coordinate input (A→B→C) and one-shot coordinate actions
- **Health Monitoring**: Built-in system health checks and status reporting
- **Response Format**: Consistent HTML responses in `<pre>` tags for easy parsing

### Real-time Communication
- **SSE Implementation**: Server-Sent Events for pushing real-time updates to the dashboard
- **Event Broadcasting**: Live event streaming to connected clients with session filtering
- **Connection Management**: Automatic client connection handling and cleanup

### Development and Build System
- **Monorepo Structure**: Unified client, server, and shared code organization
- **TypeScript Configuration**: Strict type checking with path mapping for clean imports
- **Build Pipeline**: Separate client (Vite) and server (esbuild) build processes
- **Development Server**: Integrated Vite development server with Express API proxying

## External Dependencies

### Database and Storage
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database operations and migrations
- **WebSocket Support**: Database connections using WebSocket for serverless compatibility

### Browser Automation
- **Playwright**: Browser automation engine accessed through MCP protocol
- **MCP (Model Context Protocol)**: Standardized protocol for tool integration with AI models

### AI and Language Models
- **OpenAI Integration**: GPT models, DALL-E image generation, Whisper transcription, TTS synthesis
- **Anthropic Claude**: Advanced reasoning, image analysis, text processing capabilities
- **Google Cloud AI**: High-quality speech-to-text and text-to-speech services
- **OpenRouter**: Unified API access to multiple LLM providers
- **Model Selection**: Automatic routing based on task type (reasoning, code generation, utilities)
- **Usage Tracking**: Token consumption and cost monitoring for AI operations

### Media Processing & Communication
- **Advanced Image Processing**: Sharp, JIMP for high-performance image manipulation
- **OCR Text Extraction**: Tesseract.js for extracting text from screenshots and images
- **Video Processing**: FFmpeg integration for media conversion and streaming
- **Speech Services**: Real-time speech-to-text and text-to-speech capabilities
- **WebRTC Communication**: Socket.IO for real-time screen sharing and communication
- **Cloud Infrastructure**: Google Cloud Storage, multi-provider file upload support

### UI and Styling
- **Radix UI**: Headless component primitives for accessibility
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library for consistent iconography
- **shadcn/ui**: Pre-built component library built on Radix UI

### Security & Performance
- **Security Middleware**: Helmet, CORS, rate limiting, JWT authentication
- **Data Encryption**: bcrypt password hashing, secure session management
- **Performance Optimization**: Compression, caching, Redis integration
- **Proxy & Anonymization**: Proxy chains, random IP rotation for automation

### Development Tools
- **Vite**: Fast development server and build tool for the frontend
- **esbuild**: High-performance bundler for server-side code
- **TypeScript**: Type safety across the entire application
- **Testing Suite**: Jest, ESLint, Prettier for code quality
- **Replit Integration**: Development environment integration with runtime error handling