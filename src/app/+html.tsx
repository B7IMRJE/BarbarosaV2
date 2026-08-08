import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const startupStyles = `
  html[data-homeos-loading='true'],
  html[data-homeos-loading='true'] body {
    background: #041f36;
  }

  #homeos-startup-fallback {
    align-items: center;
    background: #041f36;
    box-sizing: border-box;
    color: #f6fbff;
    display: none;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    inset: 0;
    justify-content: center;
    padding: 28px;
    position: fixed;
    text-align: center;
    z-index: 2147483647;
  }

  html[data-homeos-loading='true'] #homeos-startup-fallback {
    display: flex;
  }

  #homeos-startup-fallback__card {
    max-width: 340px;
  }

  #homeos-startup-fallback__mark {
    align-items: center;
    background: #0c8aa3;
    border-radius: 999px;
    display: flex;
    font-size: 20px;
    font-weight: 800;
    height: 48px;
    justify-content: center;
    margin: 0 auto 22px;
    width: 48px;
  }

  #homeos-startup-fallback h1 {
    font-size: 24px;
    line-height: 1.2;
    margin: 0 0 10px;
  }

  #homeos-startup-fallback p {
    color: #c8d8e5;
    font-size: 16px;
    line-height: 1.5;
    margin: 0;
  }

  #homeos-startup-fallback a {
    background: #0c8aa3;
    border-radius: 10px;
    color: #fff;
    display: inline-block;
    font-size: 16px;
    font-weight: 700;
    margin-top: 24px;
    padding: 13px 20px;
    text-decoration: none;
  }
`;

/**
 * A web-only shell that is painted before the JavaScript bundle starts.
 * It is removed by the root layout after HomeOS has mounted successfully.
 */
export default function RootHtml({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, bodyNodes, headNodes } = useServerDocumentContext();

  return (
    <html {...htmlAttributes} data-homeos-loading="true" lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#041f36" />
        <ScrollViewStyleReset />
        {headNodes}
        <style dangerouslySetInnerHTML={{ __html: startupStyles }} />
      </head>
      <body {...bodyAttributes}>
        {children}
        <main id="homeos-startup-fallback" aria-live="polite" role="status">
          <div id="homeos-startup-fallback__card">
            <div id="homeos-startup-fallback__mark" aria-hidden="true">H</div>
            <h1>Opening HomeOS</h1>
            <p>If this screen does not open in a moment, reload HomeOS to try again.</p>
            <a href="/">Reload HomeOS</a>
          </div>
        </main>
        {bodyNodes}
      </body>
    </html>
  );
}
