(function () {
    class ContentExtractor {
        constructor() {
            this.contentSelectors = [
                'article',
                'main',
                '[role="main"]',
                '.article-content',
                '.articalContent',
                '.articleContent',
                '.post-content',
                '.entry-content',
                '.content',
                '.main-content',
                '.article-body',
                '.post-body',
                '.entry-body',
                '#article',
                '#content',
                '.markdown-body',
                '.news-content',
                '.newsContent',
                '.detail-content',
                '.detailContent',
                '.rich-text',
                '.story-body',
                '.article-text',
                '.text-content',
                '.textContent',
                '[class*="article-content"]',
                '[class*="post-content"]',
                '[class*="entry-content"]',
                '[class*="main-content"]'
            ];

            this.excludeSelectors = [
                'nav',
                'header',
                'footer',
                'aside',
                '.sidebar',
                '.navigation',
                '.nav',
                '.menu',
                '.ad',
                '.advertisement',
                '.promo',
                '.related',
                '.comments',
                '.comment',
                '.social-share',
                '.share',
                '.tags',
                '.breadcrumb',
                'script',
                'style',
                'iframe',
                'noscript'
            ];
        }

        extract() {
            let content = '';

            content = this.tryCommonSelectors();
            if (content && content.length > 100) {
                return this.cleanText(content);
            }

            content = this.extractByTextDensity();
            if (content && content.length > 100) {
                return this.cleanText(content);
            }

            content = this.extractFromBody();
            return this.cleanText(content);
        }

        tryCommonSelectors() {
            for (let selector of this.contentSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    let text = '';
                    elements.forEach(el => {
                        text += this.extractTextFromElement(el) + '\n\n';
                    });
                    if (text.trim().length > 100) {
                        return text;
                    }
                }
            }
            return '';
        }

        extractByTextDensity() {
            const body = document.body;
            const candidates = this.findContentCandidates(body);

            if (candidates.length === 0) return '';

            candidates.sort((a, b) => b.score - a.score);

            return this.extractTextFromElement(candidates[0].element);
        }

        findContentCandidates(root) {
            const candidates = [];
            const elements = root.querySelectorAll('div, section, article, main');

            elements.forEach(el => {
                if (this.shouldExclude(el)) return;

                const text = el.innerText || '';
                const textLength = text.length;

                if (textLength < 50) return;

                const linkLength = this.getLinkTextLength(el);
                const linkDensity = textLength > 0 ? linkLength / textLength : 1;

                const punctuationCount = (text.match(/[。！？,.!?;；]/g) || []).length;
                const punctuationDensity = textLength > 0 ? punctuationCount / textLength : 0;

                const paragraphs = el.querySelectorAll('p').length;

                let score = textLength;
                score *= (1 - linkDensity);
                score += punctuationDensity * 1000;
                score += paragraphs * 100;

                candidates.push({ element: el, score: score, textLength: textLength });
            });

            return candidates;
        }

        shouldExclude(element) {
            for (let selector of this.excludeSelectors) {
                if (element.matches(selector)) return true;
                if (element.querySelector(selector) === element.parentElement) return true;
            }

            let parent = element.parentElement;
            while (parent) {
                for (let selector of this.excludeSelectors) {
                    if (parent.matches(selector)) return true;
                }
                parent = parent.parentElement;
            }

            return false;
        }

        getLinkTextLength(element) {
            const links = element.querySelectorAll('a');
            let length = 0;
            links.forEach(link => {
                length += (link.innerText || '').length;
            });
            return length;
        }

        extractTextFromElement(element) {
            const clone = element.cloneNode(true);

            this.excludeSelectors.forEach(selector => {
                clone.querySelectorAll(selector).forEach(el => el.remove());
            });

            clone.querySelectorAll('p, br, div, h1, h2, h3, h4, h5, h6, li').forEach(el => {
                if (el.tagName === 'BR') {
                    el.replaceWith('\n');
                } else {
                    const text = el.innerText || el.textContent || '';
                    if (text.trim()) {
                        el.insertAdjacentText('afterend', '\n');
                    }
                }
            });

            return clone.innerText || clone.textContent || '';
        }

        extractFromBody() {
            return this.extractTextFromElement(document.body);
        }

        cleanText(text) {
            return text
                .replace(/\n{3,}/g, '\n\n')
                .replace(/[ \t]{2,}/g, ' ')
                .replace(/^\s+|\s+$/gm, '')
                .trim();
        }
    }

    window.ContentExtractor = ContentExtractor;
})();
