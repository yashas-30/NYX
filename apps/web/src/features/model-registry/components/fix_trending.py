import sys

def main():
    file_path = r"e:\NYX\apps\web\src\features\model-registry\components\HuggingFaceExplorer.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Fix type
    content = content.replace(
        "type SortMode = 'trending' | 'downloads' | 'likes' | 'lastModified' | 'createdAt';", 
        "type SortMode = 'trendingScore' | 'downloads' | 'likes' | 'lastModified' | 'createdAt';"
    )
    
    # Fix SORT_OPTIONS
    content = content.replace(
        "{ value: 'trending',    label: 'Trending',        icon: <TrendUp size={12} weight=\"bold\" /> },",
        "{ value: 'trendingScore', label: 'Trending',        icon: <TrendUp size={12} weight=\"bold\" /> },"
    )
    
    # Fix useState
    content = content.replace(
        "const [sortMode, setSortMode]         = useState<SortMode>('trending');",
        "const [sortMode, setSortMode]         = useState<SortMode>('trendingScore');"
    )

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
