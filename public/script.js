// Global variables
let currentShortCode = null;

// DOM elements
const shortenForm = document.getElementById('shortenForm');
const resultDiv = document.getElementById('result');
const shortUrlInput = document.getElementById('shortUrl');
const originalUrlDisplay = document.getElementById('originalUrlDisplay');
const tagsDisplay = document.getElementById('tagsDisplay');
const tagsList = document.getElementById('tagsList');
const myUrlsDiv = document.getElementById('myUrls');
const analyticsSection = document.getElementById('analyticsSection');
const analyticsContent = document.getElementById('analyticsContent');

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    shortenForm.addEventListener('submit', handleShortenForm);
});

// Handle form submission
async function handleShortenForm(e) {
    e.preventDefault();
    
    const originalUrl = document.getElementById('originalUrl').value;
    const tagsInput = document.getElementById('tags').value;
    
    // Parse tags
    const tags = tagsInput.trim() 
        ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [];
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/shorten', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: originalUrl,
                tags: tags
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayResult(data);
            currentShortCode = data.shortCode;
            
            // Clear form
            shortenForm.reset();
            
            showToast('Ссылка успешно сокращена!', 'success');
        } else {
            showToast(data.error || 'Произошла ошибка', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Произошла ошибка при сокращении ссылки', 'error');
    } finally {
        showLoading(false);
    }
}

// Display result
function displayResult(data) {
    shortUrlInput.value = data.shortUrl;
    originalUrlDisplay.textContent = data.originalUrl;
    
    if (data.tags && data.tags.length > 0) {
        tagsDisplay.classList.remove('hidden');
        tagsList.innerHTML = data.tags.map(tag => 
            `<span class="tag">${tag}</span>`
        ).join('');
    } else {
        tagsDisplay.classList.add('hidden');
    }
    
    resultDiv.classList.remove('hidden');
}

// Copy to clipboard
async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(shortUrlInput.value);
        showToast('Ссылка скопирована в буфер обмена!', 'success');
    } catch (error) {
        // Fallback for older browsers
        shortUrlInput.select();
        document.execCommand('copy');
        showToast('Ссылка скопирована в буфер обмена!', 'success');
    }
}

// Load user's URLs
async function loadMyUrls() {
    try {
        showLoading(true);
        
        const response = await fetch('/api/my-urls');
        const urls = await response.json();
        
        if (urls.length === 0) {
            myUrlsDiv.innerHTML = '<p class="no-urls">У вас пока нет сокращённых ссылок</p>';
        } else {
            displayUrls(urls);
        }
    } catch (error) {
        console.error('Error loading URLs:', error);
        showToast('Ошибка при загрузке ссылок', 'error');
    } finally {
        showLoading(false);
    }
}

// Display URLs list
function displayUrls(urls) {
    const urlsHtml = urls.map(url => {
        const shortUrl = `${window.location.origin}/${url.short_code}`;
        const tagsHtml = url.tags && url.tags.length > 0 
            ? `<div class="url-tags">${url.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>`
            : '';
        
        const createdDate = new Date(url.created_at).toLocaleDateString('ru-RU');
        
        return `
            <div class="url-item">
                <div class="url-header">
                    <a href="${shortUrl}" class="url-short" target="_blank">${shortUrl}</a>
                    <div class="url-stats">
                        <div class="stat-item">
                            <i class="fas fa-mouse-pointer"></i>
                            <span>${url.clickCount} кликов</span>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-calendar"></i>
                            <span>${createdDate}</span>
                        </div>
                    </div>
                </div>
                <div class="url-original">→ ${url.original_url}</div>
                ${tagsHtml}
                <div class="url-actions">
                    <button class="btn btn-secondary" onclick="copyUrl('${shortUrl}')">
                        <i class="fas fa-copy"></i> Копировать
                    </button>
                    <button class="btn btn-secondary" onclick="showAnalytics('${url.short_code}')">
                        <i class="fas fa-chart-bar"></i> Аналитика
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    myUrlsDiv.innerHTML = urlsHtml;
}

// Copy URL to clipboard
async function copyUrl(url) {
    try {
        await navigator.clipboard.writeText(url);
        showToast('Ссылка скопирована!', 'success');
    } catch (error) {
        showToast('Ошибка при копировании', 'error');
    }
}

// Show analytics for a URL
async function showAnalytics(shortCode) {
    try {
        showLoading(true);
        
        const response = await fetch(`/api/analytics/${shortCode}`);
        const data = await response.json();
        
        if (response.ok) {
            displayAnalytics(data);
            analyticsSection.classList.remove('hidden');
            
            // Scroll to analytics section
            analyticsSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            showToast(data.error || 'Ошибка при загрузке аналитики', 'error');
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('Ошибка при загрузке аналитики', 'error');
    } finally {
        showLoading(false);
    }
}

// Display analytics
function displayAnalytics(data) {
    const { url, analytics } = data;
    const shortUrl = `${window.location.origin}/${url.short_code}`;
    
    // Countries list
    const countriesHtml = Object.entries(analytics.countries)
        .sort(([,a], [,b]) => b - a)
        .map(([country, count]) => `
            <div class="country-item">
                <span>${country}</span>
                <span>${count} кликов</span>
            </div>
        `).join('');
    
    // Recent clicks
    const recentClicksHtml = analytics.recentClicks.map(click => {
        const clickDate = new Date(click.clicked_at).toLocaleString('ru-RU');
        return `
            <div class="click-item">
                <div>
                    <div class="click-location">${click.city}, ${click.country}</div>
                    <div style="font-size: 12px; color: #4a5568; margin-top: 2px;">
                        ${click.browser || 'Неизвестно'} • ${click.os || 'Неизвестно'} • ${click.device_type || 'Неизвестно'}
                    </div>
                    ${click.referer ? `<div style="font-size: 12px; color: #718096;">От: ${click.referer}</div>` : ''}
                </div>
                <div class="click-time">${clickDate}</div>
            </div>
        `;
    }).join('');
    
    // Tags
    const tagsHtml = url.tags && url.tags.length > 0 
        ? `<div style="margin-bottom: 15px;">${url.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>`
        : '';
    
    const createdDate = new Date(url.created_at).toLocaleString('ru-RU');
    
    analyticsContent.innerHTML = `
        <div style="margin-bottom: 30px; padding: 20px; background: #f7fafc; border-radius: 10px;">
            <h3 style="color: #4a5568; margin-bottom: 10px;">
                <a href="${shortUrl}" target="_blank" style="color: #667eea; text-decoration: none;">${shortUrl}</a>
            </h3>
            <p style="color: #718096; word-break: break-all; margin-bottom: 10px;">→ ${url.original_url}</p>
            ${tagsHtml}
            <p style="color: #718096; font-size: 14px;">Создана: ${createdDate}</p>
        </div>
        
        <div class="analytics-grid">
            <div class="analytics-card">
                <h4>Всего кликов</h4>
                <div class="stat-number">${analytics.totalClicks}</div>
            </div>
            
            <div class="analytics-card">
                <h4>Уникальных стран</h4>
                <div class="stat-number">${Object.keys(analytics.countries).length}</div>
            </div>
            
            <div class="analytics-card">
                <h4>Клики по странам</h4>
                <div class="country-list">
                    ${countriesHtml || '<p style="color: #718096; font-style: italic;">Пока нет данных</p>'}
                </div>
            </div>
            
            <div class="analytics-card">
                <h4>Браузеры</h4>
                <div class="country-list">
                    ${analytics.browsers ? Object.entries(analytics.browsers)
                        .sort(([,a], [,b]) => b - a)
                        .map(([browser, count]) => `
                            <div class="country-item">
                                <span>${browser}</span>
                                <span>${count} кликов</span>
                            </div>
                        `).join('') : '<p style="color: #718096; font-style: italic;">Пока нет данных</p>'}
                </div>
            </div>
            
            <div class="analytics-card">
                <h4>Устройства</h4>
                <div class="country-list">
                    ${analytics.devices ? Object.entries(analytics.devices)
                        .sort(([,a], [,b]) => b - a)
                        .map(([device, count]) => `
                            <div class="country-item">
                                <span>${device}</span>
                                <span>${count} кликов</span>
                            </div>
                        `).join('') : '<p style="color: #718096; font-style: italic;">Пока нет данных</p>'}
                </div>
            </div>
            
            <div class="analytics-card">
                <h4>Операционные системы</h4>
                <div class="country-list">
                    ${analytics.operatingSystems ? Object.entries(analytics.operatingSystems)
                        .sort(([,a], [,b]) => b - a)
                        .map(([os, count]) => `
                            <div class="country-item">
                                <span>${os}</span>
                                <span>${count} кликов</span>
                            </div>
                        `).join('') : '<p style="color: #718096; font-style: italic;">Пока нет данных</p>'}
                </div>
            </div>
            
            <div class="analytics-card">
                <h4>Последние клики</h4>
                <div class="recent-clicks">
                    ${recentClicksHtml || '<p style="color: #718096; font-style: italic;">Пока нет кликов</p>'}
                </div>
            </div>
        </div>
    `;
}

// Show loading state
function showLoading(show) {
    if (show) {
        document.body.style.cursor = 'wait';
    } else {
        document.body.style.cursor = 'default';
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    
    // Hide any existing timeout
    if (window.toastTimeout) {
        clearTimeout(window.toastTimeout);
    }
    
    // Show toast
    toast.classList.remove('hidden');
    
    // Auto hide after 4 seconds
    window.toastTimeout = setTimeout(() => {
        closeToast();
    }, 4000);
}

// Close toast notification
function closeToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('hidden');
    
    if (window.toastTimeout) {
        clearTimeout(window.toastTimeout);
    }
}

// Auto-load user URLs on page load
document.addEventListener('DOMContentLoaded', function() {
    // You can uncomment this if you want to auto-load user URLs
    // loadMyUrls();
});

// Handle keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter to submit form
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.activeElement.closest('#shortenForm')) {
            shortenForm.dispatchEvent(new Event('submit'));
        }
    }
    
    // Escape to close analytics
    if (e.key === 'Escape') {
        analyticsSection.classList.add('hidden');
    }
}); 