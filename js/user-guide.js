// User Guide markdown loading functionality
let userGuideLoaded = false;
let userGuideLoading = false;
let userGuideObserver = null;

// Allow-list sanitiser for the remote User Guide markdown. `marked` does not
// sanitise its output, and the result is injected via innerHTML, so untrusted
// markdown could otherwise execute script in the app origin.
const USER_GUIDE_ALLOWED_TAGS = new Set([
  'A','P','BR','HR','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE',
  'PRE','CODE','SPAN','DIV','STRONG','EM','B','I','U','S','DEL','SUB','SUP',
  'TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','CAPTION','IMG','FIGURE',
  'FIGCAPTION','DL','DT','DD'
]);
const USER_GUIDE_ALLOWED_ATTRS = {
  '*': new Set(['class','id','title','align']),
  a: new Set(['href','target','rel']),
  img: new Set(['src','alt','width','height']),
  th: new Set(['colspan','rowspan','scope']),
  td: new Set(['colspan','rowspan'])
};

function isSafeGuideUrl(value, allowDataImage) {
  const v = String(value).trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (v.startsWith('#')) return true;
  if (/^https?:\/\//i.test(v)) return true;
  if (/^\/\//.test(v)) return true;
  if (/^mailto:/i.test(v)) return true;
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(v)) return true;
  // Anything carrying a scheme (javascript:, data:, vbscript:, ...) is rejected.
  return !/^[a-z][a-z0-9+.-]*:/i.test(v);
}

function sanitizeUserGuideHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];
  let node = walker.currentNode;
  while (node) {
    const tag = node.tagName.toLowerCase();
    if (!USER_GUIDE_ALLOWED_TAGS.has(tag)) {
      toRemove.push(node);
    } else {
      const perTag = USER_GUIDE_ALLOWED_ATTRS[tag] || new Set();
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (!(USER_GUIDE_ALLOWED_ATTRS['*'].has(name) || perTag.has(name))) {
          node.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href' && !isSafeGuideUrl(attr.value, false)) {
          node.removeAttribute(attr.name);
        } else if (name === 'src' && !isSafeGuideUrl(attr.value, true)) {
          node.removeAttribute(attr.name);
        }
      }
    }
    node = walker.nextNode();
  }
  toRemove.forEach(n => n.remove());
  return doc.body.innerHTML;
}

// Transform content into collapsible sections
function createCollapsibleSections(contentEl) {
  const children = Array.from(contentEl.children);
  const newContent = document.createDocumentFragment();
  let currentSection = null;
  let currentSectionContent = null;
  let sectionIndex = 0;
  
  children.forEach(child => {
    const tagName = child.tagName.toLowerCase();
    
    // H1 and H2 become collapsible section headers
    if (tagName === 'h1' || tagName === 'h2') {
      // Close previous section if exists
      if (currentSection) {
        newContent.appendChild(currentSection);
      }
      
      // Create new collapsible section
      const sectionId = 'guide-section-' + sectionIndex;
      const baseHeaderId = child.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const headerId = child.id || baseHeaderId + '-' + sectionIndex;
      sectionIndex++;
      
      currentSection = document.createElement('div');
      currentSection.className = 'guide-section';
      currentSection.setAttribute('data-section-id', sectionId);
      
      // Create header button
      const header = document.createElement('button');
      header.className = 'guide-section-header' + (tagName === 'h1' ? ' guide-section-h1' : '');
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-controls', sectionId + '-content');
      header.id = headerId;
      
      const headerText = document.createElement('span');
      headerText.className = 'guide-section-title';
      headerText.innerHTML = child.innerHTML;
      
      const headerIcon = document.createElement('i');
      headerIcon.className = 'mdi mdi-chevron-down guide-section-icon';
      
      header.appendChild(headerText);
      header.appendChild(headerIcon);
      
      // Create content container
      currentSectionContent = document.createElement('div');
      currentSectionContent.className = 'guide-section-content';
      currentSectionContent.id = sectionId + '-content';
      currentSectionContent.style.display = 'none';
      
      currentSection.appendChild(header);
      currentSection.appendChild(currentSectionContent);
      
      // Add click handler - capture section reference to avoid closure bug
      const sectionRef = currentSection;
      header.addEventListener('click', () => {
        toggleSection(sectionRef);
      });
    } else if (currentSectionContent) {
      // Add content to current section
      currentSectionContent.appendChild(child.cloneNode(true));
    } else {
      // Content before any section header (like intro content)
      newContent.appendChild(child.cloneNode(true));
    }
  });
  
  // Append last section
  if (currentSection) {
    newContent.appendChild(currentSection);
  }
  
  // Clear and append new content
  contentEl.innerHTML = '';
  contentEl.appendChild(newContent);
  
  // Expand the first H1 section by default
  const firstH1Section = contentEl.querySelector('.guide-section:has(.guide-section-h1)');
  if (firstH1Section) {
    toggleSection(firstH1Section, true);
  }
}

// Toggle a collapsible section
function toggleSection(section, forceOpen = null) {
  const header = section.querySelector('.guide-section-header');
  const content = section.querySelector('.guide-section-content');
  const icon = header.querySelector('.guide-section-icon');
  
  const isExpanded = header.getAttribute('aria-expanded') === 'true';
  const shouldOpen = forceOpen !== null ? forceOpen : !isExpanded;
  
  header.setAttribute('aria-expanded', shouldOpen);
  content.style.display = shouldOpen ? 'block' : 'none';
  icon.className = 'mdi guide-section-icon ' + (shouldOpen ? 'mdi-chevron-up' : 'mdi-chevron-down');
  
  if (shouldOpen) {
    section.classList.add('expanded');
  } else {
    section.classList.remove('expanded');
  }
}

// Expand all sections
function expandAllSections() {
  const sections = document.querySelectorAll('#userGuideMarkdown .guide-section');
  sections.forEach(section => toggleSection(section, true));
}

// Collapse all sections
function collapseAllSections() {
  const sections = document.querySelectorAll('#userGuideMarkdown .guide-section');
  sections.forEach(section => toggleSection(section, false));
}

// Search functionality
function initUserGuideSearch() {
  const searchInput = document.getElementById('userGuideSearch');
  const clearBtn = document.getElementById('userGuideSearchClear');
  const searchInfo = document.getElementById('userGuideSearchInfo');
  const searchCount = document.getElementById('userGuideSearchCount');
  const clearSearchBtn = document.getElementById('userGuideClearSearch');
  
  if (!searchInput) return;
  
  let searchTimeout;
  
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(searchInput.value.trim());
    }, 300);
    
    clearBtn.style.display = searchInput.value ? 'flex' : 'none';
  });
  
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    clearSearch();
  });
  
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    clearSearch();
  });
}

function performSearch(query) {
  const contentEl = document.getElementById('userGuideMarkdown');
  const searchInfo = document.getElementById('userGuideSearchInfo');
  const searchCount = document.getElementById('userGuideSearchCount');
  
  // Clear previous highlights
  clearHighlights();
  
  if (!query || query.length < 2) {
    searchInfo.style.display = 'none';
    return;
  }
  
  const sections = contentEl.querySelectorAll('.guide-section');
  let totalMatches = 0;
  let matchingSections = 0;
  
  sections.forEach(section => {
    const content = section.querySelector('.guide-section-content');
    const header = section.querySelector('.guide-section-header');
    const headerText = header.querySelector('.guide-section-title');
    
    // Search in header
    const headerMatches = highlightText(headerText, query);
    
    // Search in content
    const contentMatches = highlightInElement(content, query);
    
    const sectionMatches = headerMatches + contentMatches;
    
    if (sectionMatches > 0) {
      totalMatches += sectionMatches;
      matchingSections++;
      section.style.display = 'block';
      section.classList.add('has-search-match');
      // Expand sections with matches
      toggleSection(section, true);
    } else {
      section.style.display = 'none';
      section.classList.remove('has-search-match');
    }
  });
  
  // Show intro content if it matches, hide otherwise
  const introContent = contentEl.querySelectorAll(':scope > :not(.guide-section)');
  introContent.forEach(el => {
    const matches = highlightInElement(el, query);
    totalMatches += matches;
    el.style.display = matches > 0 ? '' : 'none';
  });
  
  searchInfo.style.display = 'flex';
  searchCount.textContent = totalMatches > 0 
    ? `${totalMatches} match${totalMatches !== 1 ? 'es' : ''} found in ${matchingSections} section${matchingSections !== 1 ? 's' : ''}`
    : 'No matches found';
}

function highlightText(element, query) {
  const text = element.textContent;
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  const matches = text.match(regex);
  
  if (matches && matches.length > 0) {
    element.innerHTML = text.replace(regex, '<mark class="search-highlight">$1</mark>');
    return matches.length;
  }
  return 0;
}

function highlightInElement(element, query) {
  let matchCount = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  
  textNodes.forEach(node => {
    const text = node.textContent;
    const matches = text.match(regex);
    
    if (matches && matches.length > 0) {
      matchCount += matches.length;
      const span = document.createElement('span');
      span.className = 'search-highlight-wrapper';
      span.innerHTML = text.replace(regex, '<mark class="search-highlight">$1</mark>');
      node.parentNode.replaceChild(span, node);
    }
  });
  
  return matchCount;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearHighlights() {
  const contentEl = document.getElementById('userGuideMarkdown');
  
  // Remove highlight marks
  contentEl.querySelectorAll('mark.search-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  
  // Remove wrapper spans from highlighting (only those we created)
  contentEl.querySelectorAll('span.search-highlight-wrapper').forEach(span => {
    const textContent = span.textContent;
    span.parentNode.replaceChild(document.createTextNode(textContent), span);
  });
  contentEl.normalize();
  
  // Show all sections
  contentEl.querySelectorAll('.guide-section').forEach(section => {
    section.style.display = 'block';
    section.classList.remove('has-search-match');
  });
  
  // Show intro content
  contentEl.querySelectorAll(':scope > :not(.guide-section)').forEach(el => {
    el.style.display = '';
  });
}

function clearSearch() {
  clearHighlights();
  document.getElementById('userGuideSearchInfo').style.display = 'none';
}

// Fix anchor links to scroll within page
function fixAnchorLinks(contentEl) {
  const links = contentEl.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      // Try to find target by ID, first in document then within content element
      // The markdown often has IDs that match anchor hrefs directly
      let targetEl = document.getElementById(targetId);
      if (!targetEl) {
        targetEl = contentEl.querySelector(`[id="${CSS.escape(targetId)}"]`);
      }
      
      if (targetEl) {
        // If target is in a collapsed section, expand it
        const section = targetEl.closest('.guide-section');
        if (section) {
          toggleSection(section, true);
        }
        
        // Scroll to target
        setTimeout(() => {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });
    
    // Remove target="_blank" for internal links
    link.removeAttribute('target');
    link.removeAttribute('rel');
  });
}

async function loadUserGuide() {
  // Prevent concurrent loads with loading flag
  if (userGuideLoaded || userGuideLoading) return;
  userGuideLoading = true;
  
  const loadingEl = document.getElementById('userGuideLoading');
  const errorEl = document.getElementById('userGuideError');
  const contentEl = document.getElementById('userGuideMarkdown');
  
  if (!loadingEl || !errorEl || !contentEl) {
    userGuideLoading = false;
    return;
  }
  
  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';
  contentEl.innerHTML = '';
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/LibreDMR/OpenGD77_UserGuide/refs/heads/master/OpenGD77_User_Guide.md');
    
    if (!response.ok) {
      throw new Error('Failed to fetch user guide');
    }
    
    const markdown = await response.text();
    
    // Configure marked for security
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    
    // Parse markdown to HTML
    const html = marked.parse(markdown);
    
    // Create a temporary element to process the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitizeUserGuideHtml(html);
    
    // Update image URLs to use the correct base path
    const images = tempDiv.querySelectorAll('img');
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        img.setAttribute('src', 'https://raw.githubusercontent.com/LibreDMR/OpenGD77_UserGuide/refs/heads/master/' + src);
      }
    });
    
    // Make external links open in a new tab (but not anchor links)
    const links = tempDiv.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
    
    contentEl.innerHTML = tempDiv.innerHTML;
    
    // Transform into collapsible sections
    createCollapsibleSections(contentEl);
    
    // Fix anchor links to scroll within page
    fixAnchorLinks(contentEl);
    
    // Initialize search
    initUserGuideSearch();
    
    // Set up expand/collapse all buttons
    document.getElementById('expandAllSections').addEventListener('click', expandAllSections);
    document.getElementById('collapseAllSections').addEventListener('click', collapseAllSections);
    
    loadingEl.style.display = 'none';
    userGuideLoaded = true;
    
    // Disconnect observer after successful load to avoid performance overhead
    if (userGuideObserver) {
      userGuideObserver.disconnect();
      userGuideObserver = null;
    }
    
  } catch (error) {
    console.error('Error loading user guide:', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'flex';
    userGuideLoading = false; // Allow retry on error
  }
}

// Load user guide when its section becomes visible
document.addEventListener('DOMContentLoaded', () => {
  // Set up observer to load user guide when section is shown
  const userGuideSection = document.getElementById('section-user-guide');
  if (userGuideSection) {
    userGuideObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const display = window.getComputedStyle(userGuideSection).display;
          if (display !== 'none') {
            loadUserGuide();
          }
        }
      });
    });
    
    userGuideObserver.observe(userGuideSection, { attributes: true });
    
    // Also check initial state
    if (window.getComputedStyle(userGuideSection).display !== 'none') {
      loadUserGuide();
    }
  }
  
  // Also load when nav item is clicked (direct trigger as backup)
  const userGuideNavItem = document.querySelector('[data-section="user-guide"]');
  if (userGuideNavItem) {
    userGuideNavItem.addEventListener('click', loadUserGuide);
  }
  
  // CPS Guide: Handle anchor links for smooth scrolling
  document.getElementById('section-cps-guide').addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#cps-"]');
    if (anchor) {
      e.preventDefault();
      const targetId = anchor.getAttribute('href').substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    
    // Handle data-section links to navigate to other CPS sections
    const sectionLink = e.target.closest('a[data-section]');
    if (sectionLink) {
      e.preventDefault();
      const sectionId = sectionLink.dataset.section;
      if (window.ui && typeof window.ui.showSection === 'function') {
        window.ui.showSection(sectionId);
      }
    }
  });
});
