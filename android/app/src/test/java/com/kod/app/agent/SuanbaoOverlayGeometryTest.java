package com.kod.app.agent;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SuanbaoOverlayGeometryTest {
    private final SuanbaoOverlayGeometry.Bounds bounds = new SuanbaoOverlayGeometry.Bounds(10, 20, 210, 420);

    @Test
    public void clampsPointToBounds() {
        assertEquals(new SuanbaoOverlayGeometry.Point(10, 420),
            SuanbaoOverlayGeometry.clamp(new SuanbaoOverlayGeometry.Point(-30, 500), bounds));
    }

    @Test
    public void normalizedPositionRoundTrips() {
        float x = SuanbaoOverlayGeometry.normalize(110, bounds.minX(), bounds.maxX());
        float y = SuanbaoOverlayGeometry.normalize(220, bounds.minY(), bounds.maxY());
        assertEquals(110, SuanbaoOverlayGeometry.denormalize(x, bounds.minX(), bounds.maxX()));
        assertEquals(220, SuanbaoOverlayGeometry.denormalize(y, bounds.minY(), bounds.maxY()));
    }

    @Test
    public void choosesNearestHorizontalEdge() {
        assertEquals(10, SuanbaoOverlayGeometry.nearestEdgeX(80, bounds));
        assertEquals(210, SuanbaoOverlayGeometry.nearestEdgeX(180, bounds));
    }
}
