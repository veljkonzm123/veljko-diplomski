export const generateStreamHTML = (streamUrl: string): string => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
          img { width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${streamUrl}" alt="Camera Stream" />
      </body>
    </html>
  `;
};
