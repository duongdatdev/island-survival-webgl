export class WeatherSystem {
    constructor() {
        this.currentWeather = 'clear';
        this.nextWeather = 'clear';
        this.transitionTimer = 0;
        this.transitionDuration = 5.0;
        this.weatherDuration = 30.0;
        this.weatherTimer = 0;

        this.cloudCover = 0.0;
        this.windSpeed = 1.0;
        this.windDirection = [1.0, 0.0, 0.5];
        this.rainIntensity = 0.0;
        this.lightningFlash = 0.0;
        this.lightningTimer = 0;

        this.debugOverride = null;
    }

    update(deltaTime) {
        if (this.transitionTimer > 0) {
            this.transitionTimer -= deltaTime;
            const p = 1.0 - Math.max(0, this.transitionTimer / this.transitionDuration);
            this._lerpWeather(p);
            if (this.transitionTimer <= 0) {
                this.currentWeather = this.nextWeather;
                this.transitionTimer = 0;
            }
        } else {
            this.weatherTimer -= deltaTime;
            if (this.weatherTimer <= 0) {
                this._pickNextWeather();
                this.transitionTimer = this.transitionDuration;
            }
        }

        if (this.currentWeather === 'storm' || this.currentWeather === 'rain') {
            this.lightningTimer -= deltaTime;
            if (this.lightningTimer <= 0) {
                this.lightningFlash = 1.0;
                this.lightningTimer = (this.currentWeather === 'storm')
                    ? 3.0 + Math.random() * 8.0
                    : 8.0 + Math.random() * 15.0;
            }
        } else {
            this.lightningFlash = 0.0;
            this.lightningTimer = 5.0;
        }
    }

    _pickNextWeather() {
        const r = Math.random();
        if (this.currentWeather === 'clear') {
            this.nextWeather = r < 0.5 ? 'cloudy' : 'clear';
            if (r > 0.7) this.nextWeather = 'rain';
        } else if (this.currentWeather === 'cloudy') {
            this.nextWeather = r < 0.4 ? 'clear' : 'cloudy';
            if (r > 0.6) this.nextWeather = 'rain';
        } else if (this.currentWeather === 'rain') {
            this.nextWeather = r < 0.3 ? 'clear' : (r < 0.6 ? 'cloudy' : 'rain');
            if (r > 0.7) this.nextWeather = 'storm';
        } else if (this.currentWeather === 'storm') {
            this.nextWeather = r < 0.4 ? 'rain' : (r < 0.7 ? 'cloudy' : 'storm');
        }
        this.weatherDuration = 20.0 + Math.random() * 30.0;
        this.weatherTimer = this.weatherDuration;
    }

    _lerpWeather(p) {
        const from = this._getWeatherValues(this.currentWeather);
        const to = this._getWeatherValues(this.nextWeather);
        this.cloudCover = from.cloudCover + (to.cloudCover - from.cloudCover) * p;
        this.windSpeed = from.windSpeed + (to.windSpeed - from.windSpeed) * p;
        this.rainIntensity = from.rainIntensity + (to.rainIntensity - from.rainIntensity) * p;
    }

    _getWeatherValues(weather) {
        switch (weather) {
            case 'clear':
                return { cloudCover: 0.1, windSpeed: 0.5 + Math.random() * 0.3, rainIntensity: 0.0 };
            case 'cloudy':
                return { cloudCover: 0.5 + Math.random() * 0.3, windSpeed: 1.0 + Math.random() * 0.5, rainIntensity: 0.0 };
            case 'rain':
                return { cloudCover: 0.8 + Math.random() * 0.2, windSpeed: 2.0 + Math.random() * 1.0, rainIntensity: 0.4 + Math.random() * 0.4 };
            case 'storm':
                return { cloudCover: 0.95 + Math.random() * 0.05, windSpeed: 3.5 + Math.random() * 1.5, rainIntensity: 0.7 + Math.random() * 0.3 };
            default:
                return { cloudCover: 0.1, windSpeed: 0.5, rainIntensity: 0.0 };
        }
    }

    getLightningModulation() {
        if (this.lightningFlash > 0.1) {
            this.lightningFlash *= 0.85;
            const flash = this.lightningFlash + (Math.random() - 0.5) * 0.3;
            return Math.max(0, flash);
        }
        return 0;
    }

    getWeatherLabel() {
        switch (this.currentWeather) {
            case 'clear': return 'Trong xanh';
            case 'cloudy': return 'Nhiều mây';
            case 'rain': return 'Mưa rào';
            case 'storm': return 'Bão tố';
            default: return 'Trong xanh';
        }
    }

    getWaveAmplitudeMultiplier() {
        return 1.0 + this.windSpeed * 0.3;
    }

    getWaveSpeedMultiplier() {
        return 1.0 + this.windSpeed * 0.2;
    }
}