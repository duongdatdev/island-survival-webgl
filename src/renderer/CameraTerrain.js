export class CameraTerrain {
    constructor() {
        this._provider = null;
        this._lastCorrectionY = 0;
    }

    setProvider(provider) {
        this._provider = provider;
    }

    solve(position, offset) {
        if (!this._provider || !this._provider.getHeight) {
            return { corrected: position, isBelow: false, yDelta: 0 };
        }

        const terrainHeight = this._provider.getHeight(position[0], position[2]);
        const minY = terrainHeight + offset;

        if (position[1] < minY) {
            const yDelta = minY - position[1];
            const corrected = [position[0], minY, position[2]];
            this._lastCorrectionY = yDelta;
            return { corrected, isBelow: true, yDelta };
        }

        this._lastCorrectionY = 0;
        return { corrected: position, isBelow: false, yDelta: 0 };
    }
}
