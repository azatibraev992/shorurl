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
    
    // Helper function to create lists
    function createStatsList(data, limit = 10, showPercentage = true) {
        const total = Object.values(data).reduce((sum, count) => sum + count, 0);
        return Object.entries(data)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([key, count]) => {
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                return `
                    <li class="stat-item">
                        <div class="stat-row">
                            <span class="stat-label">${key}</span>
                            <span class="stat-value">${count}${showPercentage ? ` (${percentage}%)` : ''}</span>
                        </div>
                        ${showPercentage ? `<div class="stat-bar"><div class="stat-fill" style="width: ${percentage}%"></div></div>` : ''}
                    </li>
                `;
            })
            .join('');
    }

    // Create hourly chart (simple text chart for now)
    function createHourlyChart(hourlyData) {
        const maxClicks = Math.max(...Object.values(hourlyData));
        return Array.from({length: 24}, (_, hour) => {
            const clicks = hourlyData[hour] || 0;
            const percentage = maxClicks > 0 ? (clicks / maxClicks) * 100 : 0;
            return `
                <div class="hour-bar" title="${hour}:00 - ${clicks} кликов">
                    <div class="hour-fill" style="height: ${percentage}%"></div>
                    <span class="hour-label">${hour}</span>
                </div>
            `;
        }).join('');
    }

    // Create daily chart for last 30 days
    function createDailyChart(dailyData) {
        const today = new Date();
        const last30Days = [];
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last30Days.push({
                date: dateStr,
                clicks: dailyData[dateStr] || 0,
                label: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
            });
        }
        
        const maxClicks = Math.max(...last30Days.map(d => d.clicks));
        
        return last30Days.map(day => {
            const percentage = maxClicks > 0 ? (day.clicks / maxClicks) * 100 : 0;
            return `
                <div class="day-bar" title="${day.label} - ${day.clicks} кликов">
                    <div class="day-fill" style="height: ${Math.max(percentage, 2)}%"></div>
                    <span class="day-label">${day.label}</span>
                </div>
            `;
        }).join('');
    }

    // Recent clicks with enhanced details
    const recentClicksHtml = analytics.recentClicks
        .map(click => {
            const clickDate = new Date(click.clicked_at);
            const timeAgo = getTimeAgo(clickDate);
            let refererDisplay = 'Прямой переход';
            if (click.referer && click.referer !== '') {
                try {
                    refererDisplay = new URL(click.referer).hostname.replace('www.', '');
                } catch (e) {
                    refererDisplay = 'Неизвестный источник';
                }
            }
            
            return `
                <div class="click-item-detailed">
                    <div class="click-main">
                        <div class="click-location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${click.country}${click.region !== 'Неизвестно' ? `, ${click.region}` : ''}${click.city !== 'Неизвестно' ? `, ${click.city}` : ''}
                        </div>
                        <div class="click-tech">
                            <span><i class="fas fa-globe"></i> ${click.browser}</span>
                            <span><i class="fas fa-desktop"></i> ${click.os}</span>
                            <span><i class="fas fa-mobile-alt"></i> ${click.device_type}</span>
                        </div>
                        <div class="click-source">
                            <i class="fas fa-external-link-alt"></i>
                            Источник: ${refererDisplay}
                        </div>
                        <div class="click-ip">
                            <i class="fas fa-network-wired"></i>
                            IP: ${click.ip_address}
                        </div>
                    </div>
                    <div class="click-time">
                        <i class="fas fa-clock"></i>
                        ${timeAgo}
                    </div>
                </div>
            `;
        }).join('');

    document.getElementById('analyticsContent').innerHTML = `
        <div class="analytics-header">
            <h3>Аналитика для: <a href="${shortUrl}" target="_blank">${shortUrl}</a></h3>
            <p class="original-url">→ ${url.original_url}</p>
            ${url.tags && url.tags.length > 0 ? `
                <div class="tags-container">
                    ${url.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            ` : ''}
            <div class="url-created">
                <i class="fas fa-calendar-plus"></i>
                Создана: ${new Date(url.created_at).toLocaleDateString('ru-RU', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                })}
            </div>
        </div>

        <!-- Summary Stats -->
        <div class="summary-stats">
            <div class="summary-card">
                <div class="summary-icon"><i class="fas fa-mouse-pointer"></i></div>
                <div class="summary-content">
                    <div class="summary-number">${analytics.summary.totalClicks}</div>
                    <div class="summary-label">Всего кликов</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon"><i class="fas fa-users"></i></div>
                <div class="summary-content">
                    <div class="summary-number">${analytics.summary.uniqueVisitors}</div>
                    <div class="summary-label">Уникальных посетителей</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon"><i class="fas fa-calendar-day"></i></div>
                <div class="summary-content">
                    <div class="summary-number">${analytics.summary.clicksLast24h}</div>
                    <div class="summary-label">За последние 24ч</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon"><i class="fas fa-calendar-week"></i></div>
                <div class="summary-content">
                    <div class="summary-number">${analytics.summary.clicksLast7days}</div>
                    <div class="summary-label">За последние 7 дней</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon"><i class="fas fa-chart-line"></i></div>
                <div class="summary-content">
                    <div class="summary-number">${analytics.summary.avgClicksPerDay}</div>
                    <div class="summary-label">Среднее в день</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon"><i class="fas fa-clock"></i></div>
                <div class="summary-content">
                    <div class="summary-number-small">${analytics.summary.peakHour}</div>
                    <div class="summary-label">Пиковый час</div>
                </div>
            </div>
        </div>

        <!-- Charts Section -->
        <div class="charts-section">
            <div class="chart-container">
                <h4><i class="fas fa-chart-bar"></i> Активность по часам (последние 7 дней)</h4>
                <div class="hourly-chart">
                    ${createHourlyChart(analytics.traffic.hourlyClicks)}
                </div>
            </div>
            
            <div class="chart-container">
                <h4><i class="fas fa-chart-area"></i> Активность по дням (последние 30 дней)</h4>
                <div class="daily-chart">
                    ${createDailyChart(analytics.traffic.dailyClicks)}
                </div>
            </div>
        </div>

        <!-- Detailed Analytics Grid -->
        <div class="analytics-grid-detailed">
            <div class="analytics-card-detailed">
                <h4><i class="fas fa-globe-americas"></i> География</h4>
                <div class="analytics-tabs">
                    <button class="tab-btn active" onclick="switchTab(this, 'countries')">Страны</button>
                    <button class="tab-btn" onclick="switchTab(this, 'cities')">Города</button>
                </div>
                <div class="tab-content active" id="countries">
                    <ul class="stats-list">${createStatsList(analytics.geographic.countries, 10)}</ul>
                </div>
                <div class="tab-content" id="cities">
                    <ul class="stats-list">${createStatsList(analytics.geographic.cities, 10)}</ul>
                </div>
            </div>
            
            <div class="analytics-card-detailed">
                <h4><i class="fas fa-desktop"></i> Технологии</h4>
                <div class="analytics-tabs">
                    <button class="tab-btn active" onclick="switchTab(this, 'browsers')">Браузеры</button>
                    <button class="tab-btn" onclick="switchTab(this, 'devices')">Устройства</button>
                    <button class="tab-btn" onclick="switchTab(this, 'os')">ОС</button>
                </div>
                <div class="tab-content active" id="browsers">
                    <ul class="stats-list">${createStatsList(analytics.technology.browsers)}</ul>
                </div>
                <div class="tab-content" id="devices">
                    <ul class="stats-list">${createStatsList(analytics.technology.devices)}</ul>
                </div>
                <div class="tab-content" id="os">
                    <ul class="stats-list">${createStatsList(analytics.technology.operatingSystems)}</ul>
                </div>
            </div>
            
            <div class="analytics-card-detailed">
                <h4><i class="fas fa-external-link-alt"></i> Источники трафика</h4>
                <ul class="stats-list">${createStatsList(analytics.traffic.referers, 15)}</ul>
            </div>
            
            <div class="analytics-card-detailed">
                <h4><i class="fas fa-calendar-alt"></i> По дням недели</h4>
                <ul class="stats-list">${createStatsList(analytics.traffic.weeklyClicks, 7, false)}</ul>
            </div>
        </div>

        ${analytics.recentClicks.length > 0 ? `
            <div class="recent-clicks-detailed">
                <h4><i class="fas fa-history"></i> Последние переходы</h4>
                <div class="clicks-list">
                    ${recentClicksHtml}
                </div>
            </div>
        ` : ''}
        
        <div class="analytics-footer">
            <button class="btn btn-secondary" onclick="closeAnalytics()">
                <i class="fas fa-times"></i> Закрыть аналитику
            </button>
            <button class="btn btn-primary" onclick="exportAnalytics('${url.short_code}')">
                <i class="fas fa-download"></i> Экспорт данных
            </button>
        </div>
    `;
}

// Switch tabs in analytics
function switchTab(button, tabId) {
    // Remove active class from all tabs in the same container
    const container = button.closest('.analytics-card-detailed');
    container.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    container.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked button and corresponding content
    button.classList.add('active');
    container.querySelector(`#${tabId}`).classList.add('active');
}

// Close analytics
function closeAnalytics() {
    analyticsSection.classList.add('hidden');
}

// Export analytics data
function exportAnalytics(shortCode) {
    // This could be enhanced to actually export data as CSV/JSON
    showToast('Экспорт данных будет добавлен в следующей версии', 'info');
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