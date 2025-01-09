/**
 * Long Weekend Calculator
 * Identifies potential long weekends based on holidays and weekends
 */
const LongWeekendCalculator = (function() {
    // Constants
    const WEEKEND_DAYS = [6, 0]; // Saturday = 6, Sunday = 0
    MIN_LONG_WEEKEND = 3
    const HOLIDAY_TYPES = {
        GAZETTED: 'Gazetted Holiday',
        RESTRICTED: 'Restricted Holiday'
    };

    class Holiday {
        constructor(date, name, type) {
            this.date = moment(date, 'D MMM');
            this.name = name.trim();
            this.type = type.trim();
            this.isConfirmedHoliday = type === HOLIDAY_TYPES.GAZETTED;
        }
    }

    class Calendar {
        constructor(selector) {
            this.el = document.querySelector(selector);
            if (!this.el) throw new Error(`Element ${selector} not found`);
            
            this.holidays = [];
            this.currentDate = moment().startOf('month');
            this.selectedDay = null;
            this.longWeekends = [];
            
            this.setupContainer();
            this.bindEvents();
            moment.updateLocale('en', { week: { dow: 1 } }); // Start week on Monday
        }

        async loadHolidays() {
            try {
                const response = await fetch('data/holidays.csv');
                if (!response.ok) throw new Error('Failed to fetch holidays');
                
                const csvText = await response.text();
                Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        this.holidays = results.data
                            .filter(row => row.Date && row.Name && row.Type)
                            .map(row => new Holiday(row.Date, row.Name, row.Type));
                        this.render();
                    },
                    error: (error) => {
                        console.error('CSV parsing error:', error);
                        this.showError('Failed to parse holidays data');
                    }
                });
            } catch (error) {
                console.error('Error loading holidays:', error);
                this.showError('Failed to load holidays');
            }
        }

        setupContainer() {
            this.el.className = 'lwc-container';
            this.header = document.createElement('div');
            this.header.className = 'lwc-header';
            this.content = document.createElement('div');
            this.content.className = 'lwc-content';
            this.el.appendChild(this.header);
            this.el.appendChild(this.content);
        }

        bindEvents() {
            document.addEventListener('click', (e) => {
                const dayEl = e.target.closest('.lwc-day');
                if (dayEl) {
                    this.handleDayClick(dayEl);
                } else if (!e.target.closest('.lwc-details')) {
                    this.closeDetails();
                }
            });
        }

        findLongWeekends(month) {
            const longWeekends = [];
            const monthStart = month.clone().startOf('month');
            const monthEnd = month.clone().endOf('month');
            
            // Extend search range to include adjacent weeks
            const searchStart = monthStart.clone().subtract(7, 'days');
            const searchEnd = monthEnd.clone().add(7, 'days');
            
            let currentDate = searchStart.clone();
            
            while (currentDate.isSameOrBefore(searchEnd)) {
                let consecutiveDays = [];
                let daysCount = 0;
                
                // Look ahead up to 7 days to find potential long weekends
                for (let i = 0; i < 7; i++) {
                    const checkDate = currentDate.clone().add(i, 'days');
                    
                    // Skip if we're already past the relevant range
                    if (!checkDate.isBetween(searchStart, searchEnd, 'day', '[]')) {
                        break;
                    }

                    const isWeekend = WEEKEND_DAYS.includes(checkDate.day());
                    const holiday = this.holidays.find(h => h.date.isSame(checkDate, 'day'));
                    const isHoliday = holiday?.isConfirmedHoliday;
                    const isSuggestedDayOff = this.findSuggestedDayOff(checkDate);

                    if (isWeekend || isHoliday || isSuggestedDayOff) {
                        consecutiveDays.push({
                            date: checkDate.clone(),
                            type: isHoliday ? 'holiday' : 
                                  isWeekend ? 'weekend' : 'suggested',
                            holiday: holiday,
                            isSuggested: isSuggestedDayOff
                        });
                        daysCount++;
                    } else {
                        // Break if we've found a non-holiday weekday
                        break;
                    }
                }

                // Check if this qualifies as a long weekend
                if (daysCount >= MIN_LONG_WEEKEND && 
                    consecutiveDays.some(d => d.date.isSame(monthStart, 'month') || 
                                            d.date.isSame(monthEnd, 'month'))) {
                    // Ensure at least one day is a holiday or suggested day off
                    if (consecutiveDays.some(d => d.type === 'holiday' || d.type === 'suggested')) {
                        longWeekends.push(consecutiveDays);
                    }
                }

                currentDate.add(1, 'day');
            }

            return longWeekends;
        }


        getLongWeekendDescription(weekend) {
            const start = weekend[0].date;
            const end = weekend[weekend.length - 1].date;
            const holidays = weekend.filter(d => d.holiday).map(d => d.holiday);
            const suggestedDays = weekend.filter(d => d.isSuggested)
                                       .map(d => d.date.format('dddd, MMMM D'));

            let description = `${start.format('MMMM D')} - ${end.format('MMMM D')}`;
            description += `\n${weekend.length} days off`;

            if (holidays.length > 0) {
                description += '\n\nHolidays:';
                holidays.forEach(h => {
                    description += `\n${h.date.format('MMMM D')} - ${h.name}`;
                });
            }

            if (suggestedDays.length > 0) {
                description += '\n\nSuggested days to take off:';
                suggestedDays.forEach(day => {
                    description += `\n${day}`;
                });
            }

            return description;
        }


        isOffDay(date) {
            return WEEKEND_DAYS.includes(date.day()) || 
                   this.holidays.some(h => h.isConfirmedHoliday && h.date.isSame(date, 'day'));
        }

        findSuggestedDayOff(date) {
            // If it's already a holiday or weekend, it's not a suggested day off
            if (this.isOffDay(date)) return false;

            const prevDay = date.clone().subtract(1, 'day');
            const nextDay = date.clone().add(1, 'day');
            const prev2Day = date.clone().subtract(2, 'day');
            const next2Day = date.clone().add(2, 'day');

            // Case 1: Day between two holidays/weekends
            if (this.isOffDay(prevDay) && this.isOffDay(nextDay)) return true;

            // Case 2: Bridge day between holiday and weekend
            if ((this.isOffDay(prevDay) && this.isOffDay(next2Day)) ||
                (this.isOffDay(prev2Day) && this.isOffDay(nextDay))) return true;

            return false;
        }

        isPartOfLongWeekend(date) {
            return this.longWeekends.some(weekend => 
                weekend.some(day => day.date.isSame(date, 'day'))
            );
        }

        handleDayClick(dayEl) {
            const dateStr = dayEl.dataset.date;
            if (!dateStr) return;

            const date = moment(dateStr);
            const holiday = this.holidays.find(h => h.date.isSame(date, 'day'));
            
            this.closeDetails();
            
            if (holiday || this.isPartOfLongWeekend(date)) {
                this.showDetails(date, dayEl);
            }
        }

        showDetails(date, targetEl) {
            const holiday = this.holidays.find(h => h.date.isSame(date, 'day'));
            const isWeekend = WEEKEND_DAYS.includes(date.day());
            const isLongWeekend = this.isPartOfLongWeekend(date);
            
            const details = document.createElement('div');
            details.className = 'lwc-details';
            
            let content = `<h4>${date.format('MMMM D, YYYY')}</h4>`;
            
            if (holiday) {
                content += `
                    <p><strong>${holiday.name}</strong></p>
                    <p>${holiday.type}</p>
                `;
            }
            
            if (isWeekend) {
                content += `<p>${date.format('dddd')} - Weekend</p>`;
            }
            
            if (isLongWeekend) {
                const weekend = this.longWeekends.find(w => 
                    w.some(d => d.date.isSame(date, 'day'))
                );
                
                if (weekend) {
                    const start = weekend[0].date;
                    const end = weekend[weekend.length - 1].date;
                    content += `
                        <p><strong>Long Weekend Opportunity!</strong></p>
                        <p>${start.format('MMM D')} - ${end.format('MMM D')}</p>
                        <p>${weekend.length} days off</p>
                    `;
                }
            }
            
            details.innerHTML = content;
            targetEl.appendChild(details);
        }

        closeDetails() {
            const details = document.querySelector('.lwc-details');
            if (details) {
                details.remove();
            }
        }

        showError(message) {
            const error = document.createElement('div');
            error.className = 'lwc-error';
            error.textContent = message;
            this.content.innerHTML = '';
            this.content.appendChild(error);
        }

        renderHeader() {
            this.header.innerHTML = `
                <div class="lwc-nav">
                    <button class="lwc-nav-btn prev">&larr;</button>
                    <h1>${this.currentDate.format('MMMM YYYY')}</h1>
                    <button class="lwc-nav-btn next">&rarr;</button>
                </div>
                <div class="lwc-legend">
                    <div class="lwc-legend-item">
                        <span class="lwc-legend-color weekend"></span>
                        <span>Weekend</span>
                    </div>
                    <div class="lwc-legend-item">
                        <span class="lwc-legend-color holiday"></span>
                        <span>Holiday</span>
                    </div>
                    <div class="lwc-legend-item">
                        <span class="lwc-legend-color suggested"></span>
                        <span>Suggested Day Off</span>
                    </div>
                    <div class="lwc-legend-item">
                        <span class="lwc-legend-color long-weekend"></span>
                        <span>Long Weekend</span>
                    </div>
                </div>
            `;

            // Bind navigation events
            this.header.querySelector('.prev').addEventListener('click', () => {
                this.currentDate.subtract(1, 'month');
                this.render();
            });

            this.header.querySelector('.next').addEventListener('click', () => {
                this.currentDate.add(1, 'month');
                this.render();
            });
        }

        render() {
            this.renderHeader();
            
            const monthStart = this.currentDate.clone().startOf('month');
            const monthEnd = this.currentDate.clone().endOf('month');
            this.longWeekends = this.findLongWeekends(this.currentDate);
            
            let calendarHTML = `
                <div class="lwc-weekdays">
                    ${moment.weekdaysShort().map(day => 
                        `<div class="lwc-weekday">${day}</div>`
                    ).join('')}
                </div>
                <div class="lwc-days">
            `;

            // Fill in days
            let day = monthStart.clone().startOf('week');
            while (day.isSameOrBefore(monthEnd.endOf('week'))) {
                const isCurrentMonth = day.month() === monthStart.month();
                const isToday = day.isSame(moment(), 'day');
                const isWeekend = WEEKEND_DAYS.includes(day.day());
                const holiday = this.holidays.find(h => h.date.isSame(day, 'day'));
                const isPartOfLongWeekend = this.isPartOfLongWeekend(day);
                
                // Determine day type for styling
                let classes = ['lwc-day'];
                if (!isCurrentMonth) classes.push('other-month');
                if (isToday) classes.push('today');
                if (isWeekend) classes.push('weekend');
                if (holiday?.isConfirmedHoliday) classes.push('holiday');
                if (this.longWeekends.some(weekend => 
                    weekend.find(d => d.date.isSame(day, 'day'))?.type === 'suggested'
                )) {
                    classes.push('suggested');
                }
                if (isPartOfLongWeekend) classes.push('lwc-long-weekend');

                calendarHTML += `
                    <div class="${classes.join(' ')}" data-date="${day.format('YYYY-MM-DD')}">
                        <div class="lwc-day-content">
                            <span class="lwc-day-number">${day.format('D')}</span>
                            ${holiday ? `<span class="lwc-event">${holiday.name}</span>` : ''}
                        </div>
                    </div>
                `;

                day.add(1, 'day');
            }

            calendarHTML += '</div>';
            this.content.innerHTML = calendarHTML;
        }
    }

    return Calendar;
})();

// Initialize the calendar when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        const calendar = new LongWeekendCalculator('.long-weekend-container');
        calendar.loadHolidays();
    } catch (error) {
        console.error('Failed to initialize calendar:', error);
    }
});