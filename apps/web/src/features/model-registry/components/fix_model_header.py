import re

def main():
    file_path = r"e:\NYX\apps\web\src\features\model-registry\components\HuggingFaceExplorer.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Decrease model header
    old_model_header = """            <div className="px-6 py-4 border-b border-border/50 bg-background/90 backdrop-blur-md shrink-0 flex flex-col gap-3 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-foreground">Models</span>
                  {searchResults.length > 0 && (
                    <span className="text-sm font-medium text-muted-foreground">{formatCount(searchResults.length)}</span>
                  )}
                </div>
              </div>
              

            </div>"""

    new_model_header = """            <div className="px-6 py-2 border-b border-border/50 bg-background/90 backdrop-blur-md shrink-0 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">Models</span>
                {searchResults.length > 0 && (
                  <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{formatCount(searchResults.length)}</span>
                )}
              </div>
            </div>"""

    content = content.replace(old_model_header, new_model_header)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
