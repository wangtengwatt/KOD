package com.kod.app.agent;

final class SuanbaoOverlayGeometry {
    record Bounds(int minX, int minY, int maxX, int maxY) {}
    record Point(int x, int y) {}

    private SuanbaoOverlayGeometry() {}

    static int clamp(int value, int min, int max) {
        if (max < min) return min;
        return Math.max(min, Math.min(value, max));
    }

    static float clamp01(float value) {
        if (Float.isNaN(value) || Float.isInfinite(value)) return 0.5f;
        return Math.max(0f, Math.min(value, 1f));
    }

    static float normalize(int value, int min, int max) {
        if (max <= min) return 0f;
        return clamp01((value - min) / (float) (max - min));
    }

    static int denormalize(float value, int min, int max) {
        if (max <= min) return min;
        return Math.round(min + clamp01(value) * (max - min));
    }

    static Point clamp(Point point, Bounds bounds) {
        return new Point(clamp(point.x(), bounds.minX(), bounds.maxX()), clamp(point.y(), bounds.minY(), bounds.maxY()));
    }

    static int nearestEdgeX(int x, Bounds bounds) {
        int midpoint = bounds.minX() + Math.max(0, bounds.maxX() - bounds.minX()) / 2;
        return x <= midpoint ? bounds.minX() : bounds.maxX();
    }
}
