export class CameraState {
    constructor(name) {
        this.name = name;
    }

    onEnter(camera) {}

    onExit(camera) {}

    getConfigOverrides() {
        return {};
    }
}

export class ExploreState extends CameraState {
    constructor() {
        super('Explore');
    }
}
