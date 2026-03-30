(function () {
    class MetadataExtractor {
        extract() {
            return {
                title: this._getTitle(),
                description: this._getMeta('description') || this._getOG('description'),
                author: this._getAuthor(),
                publishedTime: this._getPublishedTime(),
                tags: this._getTags(),
                ogImage: this._getOG('image'),
                ogType: this._getOG('type'),
                canonicalUrl: this._getCanonicalUrl(),
                siteName: this._getOG('site_name'),
            };
        }

        _getTitle() {
            return this._getOG('title') || document.title || '';
        }

        _getMeta(name) {
            const el = document.querySelector(`meta[name="${name}"]`);
            return el ? el.getAttribute('content') : '';
        }

        _getOG(property) {
            const el = document.querySelector(`meta[property="og:${property}"]`);
            return el ? el.getAttribute('content') : '';
        }

        _getAuthor() {
            return this._getMeta('author')
                || this._getMeta('article:author')
                || document.querySelector('[rel="author"]')?.textContent?.trim()
                || document.querySelector('.author, .byline, [class*="author"]')?.textContent?.trim()
                || '';
        }

        _getPublishedTime() {
            return document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
                || document.querySelector('time[datetime]')?.getAttribute('datetime')
                || document.querySelector('time')?.textContent?.trim()
                || '';
        }

        _getTags() {
            const keywords = this._getMeta('keywords');
            if (keywords) return keywords.split(',').map(k => k.trim()).filter(Boolean);
            const tagEls = document.querySelectorAll('.tag, .tags a, [class*="tag"] a');
            return Array.from(tagEls).map(el => el.textContent.trim()).filter(Boolean).slice(0, 10);
        }

        _getCanonicalUrl() {
            return document.querySelector('link[rel="canonical"]')?.getAttribute('href') || window.location.href;
        }

        formatForAI(metadata) {
            const parts = [];
            if (metadata.title) parts.push(`标题：${metadata.title}`);
            if (metadata.author) parts.push(`作者：${metadata.author}`);
            if (metadata.publishedTime) parts.push(`发布时间：${metadata.publishedTime}`);
            if (metadata.siteName) parts.push(`来源：${metadata.siteName}`);
            if (metadata.tags?.length) parts.push(`标签：${metadata.tags.join('、')}`);
            if (metadata.description) parts.push(`摘要：${metadata.description}`);
            return parts.join('\n');
        }
    }

    window.MetadataExtractor = MetadataExtractor;
})();
