import re
import sys

def main():
    file_path = r"e:\NYX\apps\web\src\features\model-registry\components\HuggingFaceExplorer.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add CaretLeft to imports if it's not there
    if "CaretLeft" not in content:
        content = content.replace("ArrowSquareOut,", "ArrowSquareOut, CaretLeft,")

    # 2. Add avatar caching
    avatar_cache_code = """
const avatarCache = new Map<string, Promise<string | null>>();

const getHfAvatar = (creator: string): Promise<string | null> => {
  if (avatarCache.has(creator)) return avatarCache.get(creator)!;
  
  const promise = fetch(`https://huggingface.co/api/users/${creator}/avatar`)
    .then(res => {
        if (!res.ok) {
            return fetch(`https://huggingface.co/api/organizations/${creator}/avatar`);
        }
        return res;
    })
    .then(res => res.ok ? res.json() : null)
    .then(data => data?.avatarUrl || null)
    .catch(() => null);
    
  avatarCache.set(creator, promise);
  return promise;
};
"""
    if "const avatarCache" not in content:
        content = content.replace("const ProviderAvatar:", avatar_cache_code + "\nconst ProviderAvatar:")

    # 3. Update ProviderAvatar
    old_avatar_start = """const ProviderAvatar: React.FC<{ creator: string; size?: 'sm' | 'md' | 'lg' }> = ({ creator, size = 'sm' }) => {
  const [imageError, setImageError] = useState(false);"""
    
    new_avatar_start = """const ProviderAvatar: React.FC<{ creator: string; size?: 'sm' | 'md' | 'lg' }> = ({ creator, size = 'sm' }) => {
  const [imageError, setImageError] = useState(false);
  const [hfAvatar, setHfAvatar] = useState<string | null>(null);

  useEffect(() => {
    getHfAvatar(creator).then(url => {
      if (url) setHfAvatar(url);
    });
  }, [creator]);
"""
    content = content.replace(old_avatar_start, new_avatar_start)

    old_avatar_url = """  const useImage = !!meta && !imageError;
  const githubUser = meta?.github ?? creator;
  const avatarUrl = `https://github.com/${githubUser}.png?size=${size === 'lg' ? 96 : size === 'md' ? 72 : 44}`;"""
    
    new_avatar_url = """  const useImage = (!!hfAvatar || !!meta) && !imageError;
  const githubUser = meta?.github ?? creator;
  const fallbackAvatarUrl = `https://github.com/${githubUser}.png?size=${size === 'lg' ? 96 : size === 'md' ? 72 : 44}`;
  const avatarUrl = hfAvatar || fallbackAvatarUrl;"""
    content = content.replace(old_avatar_url, new_avatar_url)

    # 4. Change Close button to Cancel button at top left
    old_close_btn = """                  <div className="relative z-10">
                    <button
                      onClick={() => setSelectedModel(null)}
                      className="absolute top-0 right-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground transition-all border border-border/50 text-xs font-semibold"
                    >
                      <X size={12} weight="bold" /> Close
                    </button>
                    
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap pr-24">"""
                    
    new_close_btn = """                  <div className="relative z-10">
                    <div className="mb-4">
                      <button
                        onClick={() => setSelectedModel(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground transition-all border border-border/50 text-xs font-semibold"
                      >
                        <CaretLeft size={12} weight="bold" /> Cancel
                      </button>
                    </div>
                    
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">"""
    
    content = content.replace(old_close_btn, new_close_btn)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
