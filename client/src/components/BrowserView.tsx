import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BrowserViewProps {
  activeSession: string | null;
}

export default function BrowserView({ activeSession }: BrowserViewProps) {
  const [url, setUrl] = useState("https://www.google.com");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takeScreenshot = async () => {
    if (!activeSession) {
      setError("No active session selected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/h/1/${activeSession}`);
      const text = await response.text();
      
      // Parse the response to check if screenshot was taken
      if (text.includes("SCREENSHOT_TAKEN: true")) {
        // Create a unique URL to force refresh
        const timestamp = new Date().getTime();
        setScreenshotUrl(`/api/artifacts/screenshot/${activeSession}?t=${timestamp}`);
      } else {
        setError("Failed to take screenshot");
      }
    } catch (err) {
      setError("Error taking screenshot: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const navigate = async () => {
    if (!activeSession || !url) {
      setError("Session and URL required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`/nav/${activeSession}/${encodedUrl}`);
      
      if (response.ok) {
        // After navigation, take a screenshot
        setTimeout(() => takeScreenshot(), 2000);
      } else {
        setError("Navigation failed");
      }
    } catch (err) {
      setError("Error navigating: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Browser Controls */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL..."
            className="flex-1"
            data-testid="input-url"
            onKeyDown={(e) => e.key === 'Enter' && navigate()}
          />
          <Button
            onClick={navigate}
            disabled={isLoading || !activeSession}
            data-testid="button-navigate"
          >
            <i className="fas fa-arrow-right mr-2"></i>
            Go
          </Button>
          <Button
            variant="outline"
            onClick={takeScreenshot}
            disabled={isLoading || !activeSession}
            data-testid="button-screenshot"
          >
            <i className={`fas ${isLoading ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
            Screenshot
          </Button>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-muted-foreground">Session:</span>
            <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
              {activeSession || 'No session'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${activeSession ? 'bg-success' : 'bg-muted-foreground'}`} />
            <span className="text-muted-foreground">
              {activeSession ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Screenshot Display */}
      <div className="flex-1 bg-muted/30 border border-border rounded-md overflow-auto">
        {screenshotUrl ? (
          <div className="p-4">
            <img
              src={screenshotUrl}
              alt="Browser Screenshot"
              className="max-w-full h-auto border border-border rounded shadow-lg"
              data-testid="screenshot-image"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <i className="fas fa-desktop text-4xl mb-4"></i>
              <h3 className="text-lg font-medium mb-2">Browser View</h3>
              <p className="mb-4">Navigate to a website and take a screenshot to see it here</p>
              {!activeSession ? (
                <p className="text-sm text-destructive">Please select an active session first</p>
              ) : (
                <Button
                  onClick={takeScreenshot}
                  disabled={isLoading}
                  variant="outline"
                  data-testid="button-initial-screenshot"
                >
                  <i className={`fas ${isLoading ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                  Take Screenshot
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <div>
            Screenshots are captured using ExecuteAutomation Playwright MCP Server
          </div>
          <div className="flex items-center space-x-2">
            <i className="fas fa-clock"></i>
            <span>Updated: {new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}