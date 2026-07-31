import sys

def main():
    file_path = r"e:\NYX\apps\web\src\features\model-registry\components\HuggingFaceExplorer.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # The issue is near the end. Let's find the trailing `)}` that shouldn't be there.
    # From lines 1012 to 1021:
    # 1012:                 </div>
    # 1013:               </div>
    # 1014:             </div>
    # 1015:           )}
    # 1016:         </div>
    # 1017:         )}
    # 1018:       </div>
    # 1019:     </div>
    # 1020:   );
    # 1021: };
    
    # We want to remove line 1017 `        )}` if it matches.
    for i in range(len(lines)-1, max(-1, len(lines)-30), -1):
        if "        )}" in lines[i]:
            del lines[i]
            break

    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

if __name__ == "__main__":
    main()
