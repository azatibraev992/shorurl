// Global variables
let currentShortCode = null;
let currentUser = null;
let editingUrl = null;

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
    const savedUser = localStorage.getItem('shorurl_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUserInterface();
    }
    
    shortenForm.addEventListener('submit', handleShortenForm);
    document.getElementById('editForm').addEventListener('submit', handleEditForm);
    
    // Enter key handler for password input
    document.getElementById('userPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
});

// Authentication functions
async function login() {
    const password = document.getElementById('userPassword').value;
    
    if (!password || password.length < 4) {
        showToast('Пароль должен быть не менее 4 символов', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = { userId: data.userId, password };
            localStorage.setItem('shorurl_user', JSON.stringify(currentUser));
            updateUserInterface();
            showToast(data.message, 'success');
            
            // Clear password input
            document.getElementById('userPassword').value = '';
            
            // Auto-load user URLs
            loadMyUrls();
        } else {
            showToast(data.error || 'Ошибка входа', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Ошибка при входе', 'error');
    } finally {
        showLoading(false);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('shorurl_user');
    updateUserInterface();
    showToast('Вы вышли из аккаунта', 'success');
    
    // Clear URLs list
    document.getElementById('myUrls').innerHTML = '<p class="no-urls">Войдите в аккаунт, чтобы увидеть ваши ссылки</p>';
}

function updateUserInterface() {
    const loginSection = document.getElementById('loginSection');
    const loggedInSection = document.getElementById('loggedInSection');
    const userInfo = document.getElementById('userInfo');
    const loginHint = document.getElementById('loginHint');
    
    if (currentUser) {
        loginSection.classList.add('hidden');
        loggedInSection.classList.remove('hidden');
        userInfo.textContent = `Пользователь: ${currentUser.userId.replace('user_', '').substring(0, 8)}...`;
        loginHint.classList.add('hidden');
    } else {
        loginSection.classList.remove('hidden');
        loggedInSection.classList.add('hidden');
        loginHint.classList.remove('hidden');
    }
}

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
                tags: tags,
                userId: currentUser ? currentUser.userId : null
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
        
        const url = currentUser 
            ? `/api/my-urls?userId=${currentUser.userId}`
            : '/api/my-urls';
            
        const response = await fetch(url);
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
        const updatedDate = url.updated_at ? new Date(url.updated_at).toLocaleDateString('ru-RU') : null;
        
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
                        ${updatedDate ? `<div class="stat-item">
                            <i class="fas fa-edit"></i>
                            <span>изм. ${updatedDate}</span>
                        </div>` : ''}
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
                    ${currentUser ? `<button class="btn btn-edit" onclick="editUrl('${url.short_code}', '${url.original_url.replace(/'/g, "&apos;")}', '${url.tags ? url.tags.join(', ') : ''}')">
                        <i class="fas fa-edit"></i> Редактировать
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    myUrlsDiv.innerHTML = urlsHtml;
}

// Edit URL functions
function editUrl(shortCode, originalUrl, tags) {
    editingUrl = { shortCode, originalUrl, tags };
    
    document.getElementById('editOriginalUrl').value = originalUrl;
    document.getElementById('editTags').value = tags;
    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    editingUrl = null;
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editForm').reset();
}

async function handleEditForm(e) {
    e.preventDefault();
    
    if (!editingUrl || !currentUser) {
        showToast('Ошибка: нет данных для редактирования', 'error');
        return;
    }
    
    const originalUrl = document.getElementById('editOriginalUrl').value;
    const tagsInput = document.getElementById('editTags').value;
    
    // Parse tags
    const tags = tagsInput.trim() 
        ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [];
    
    try {
        showLoading(true);
        
        const response = await fetch(`/api/url/${editingUrl.shortCode}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                originalUrl,
                tags,
                userId: currentUser.userId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Ссылка успешно обновлена!', 'success');
            closeEditModal();
            loadMyUrls(); // Refresh the list
        } else {
            showToast(data.error || 'Ошибка при обновлении ссылки', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Ошибка при обновлении ссылки', 'error');
    } finally {
        showLoading(false);
    }
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
    const countriesList = Object.entries(analytics.countries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([country, count]) => `<li class="country-item"><span>${country}</span><span>${count}</span></li>`)
        .join('');
    
    // Browsers list
    const browsersList = Object.entries(analytics.browsers)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([browser, count]) => `<li class="country-item"><span>${browser}</span><span>${count}</span></li>`)
        .join('');
    
    // Devices list
    const devicesList = Object.entries(analytics.devices)
        .sort((a, b) => b[1] - a[1])
        .map(([device, count]) => `<li class="country-item"><span>${device}</span><span>${count}</span></li>`)
        .join('');
    
    // OS list
    const osList = Object.entries(analytics.operatingSystems)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([os, count]) => `<li class="country-item"><span>${os}</span><span>${count}</span></li>`)
        .join('');
    
    // Recent clicks
    const recentClicksHtml = analytics.recentClicks
        .slice(0, 10)
        .map(click => {
            const clickDate = new Date(click.clicked_at);
            const timeAgo = getTimeAgo(clickDate);
            
            return `
                <div class="click-item">
                    <div>
                        <div class="click-location">${click.country}, ${click.city}</div>
                        <div style="font-size: 12px; color: #666;">
                            ${click.browser} • ${click.os} • ${click.device_type}
                        </div>
                    </div>
                    <div class="click-time">${timeAgo}</div>
                </div>
            `;
        }).join('');
    
    document.getElementById('analyticsContent').innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 10px;">Аналитика для: <a href="${shortUrl}" target="_blank">${shortUrl}</a></h3>
            <p style="color: #666; word-break: break-all;">→ ${url.original_url}</p>
            ${url.tags && url.tags.length > 0 ? `
                <div style="margin-top: 10px;">
                    ${url.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            ` : ''}
        </div>
        
        <div class="analytics-grid">
            <div class="analytics-card">
                <h4>Общая статистика</h4>
                <div class="stat-number">${analytics.totalClicks}</div>
                <p>Всего кликов</p>
            </div>
            
            <div class="analytics-card">
                <h4>Топ страны</h4>
                <ul class="country-list">${countriesList || '<li>Нет данных</li>'}</ul>
            </div>
            
            <div class="analytics-card">
                <h4>Браузеры</h4>
                <ul class="country-list">${browsersList || '<li>Нет данных</li>'}</ul>
            </div>
            
            <div class="analytics-card">
                <h4>Устройства</h4>
                <ul class="country-list">${devicesList || '<li>Нет данных</li>'}</ul>
            </div>
            
            <div class="analytics-card">
                <h4>Операционные системы</h4>
                <ul class="country-list">${osList || '<li>Нет данных</li>'}</ul>
            </div>
        </div>
        
        ${analytics.recentClicks.length > 0 ? `
            <div class="recent-clicks">
                <h4>Последние переходы</h4>
                ${recentClicksHtml}
            </div>
        ` : ''}
    `;
}

// Helper function to get time ago
function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Только что';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} мин назад`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} ч назад`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} дн назад`;
    }
}

// Loading and UI helpers
function showLoading(show) {
    const buttons = document.querySelectorAll('button');
    const forms = document.querySelectorAll('form');
    
    buttons.forEach(btn => {
        btn.disabled = show;
    });
    
    if (show) {
        document.body.classList.add('loading');
    } else {
        document.body.classList.remove('loading');
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        closeToast();
    }, 5000);
}

function closeToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('hidden');
}

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