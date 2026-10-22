package sep.pksep.app;

import static org.junit.Assert.*;

import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class CallRingtoneSessionTest {
    private static class Playback implements CallRingtoneSession.Playback {
        int starts;
        int stops;
        public void start() { starts++; }
        public void stop() { stops++; }
    }

    private static class Scheduler implements CallRingtoneSession.Scheduler {
        final List<Runnable> pending = new ArrayList<>();
        long delay;
        public void postDelayed(Runnable callback, long delayMs) {
            pending.add(callback);
            delay = delayMs;
        }
        public void removeCallbacks(Runnable callback) { pending.remove(callback); }
    }

    @Test
    public void remoteAnswerStopsEitherRingtoneSource() {
        for (String source : new String[] { "system", "asset" }) {
            Scheduler scheduler = new Scheduler();
            CallRingtoneSession session = new CallRingtoneSession(scheduler);
            Playback playback = new Playback();
            session.start("answered-on-desktop", source, () -> playback, () -> fail("Отменённый звонок не истекает"));
            Runnable staleTimeout = scheduler.pending.get(0);
            session.stop("answered-on-desktop");
            staleTimeout.run();
            assertEquals(1, playback.starts);
            assertEquals(1, playback.stops);
            assertTrue(scheduler.pending.isEmpty());
        }
    }

    @Test
    public void unrelatedOldCallDoesNotKeepCurrentRingtonePlaying() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback playback = new Playback();
        session.start("current", "system", () -> playback, () -> {});
        session.stop("old-persisted-call");
        assertEquals(0, playback.stops);
        session.stop("current");
        assertEquals(1, playback.stops);
    }

    @Test
    public void repeatedDeliveryDoesNotStartSecondPlayerOrExtendDeadline() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback playback = new Playback();
        session.start("room", "system", () -> playback, () -> {});
        Runnable deadline = scheduler.pending.get(0);
        session.start("room", "asset", () -> { fail("Второй рингтон не нужен"); return null; }, () -> {});
        assertEquals(1, playback.starts);
        assertEquals(1, scheduler.pending.size());
        assertSame(deadline, scheduler.pending.get(0));
    }

    @Test
    public void lostDismissEventCannotLeaveRingtonePlayingForever() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback playback = new Playback();
        int[] expired = { 0 };
        session.start("room", "asset", () -> playback, () -> expired[0]++);
        assertEquals(60_000L, scheduler.delay);
        Runnable deadline = scheduler.pending.get(0);
        deadline.run();
        deadline.run();
        assertEquals(1, playback.stops);
        assertEquals(1, expired[0]);
        assertTrue(scheduler.pending.isEmpty());
    }

    @Test
    public void oldTimerAndDismissDoNotStopNewIncomingCall() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback first = new Playback();
        Playback second = new Playback();
        session.start("first", "system", () -> first, () -> fail("Таймер старого звонка отменён"));
        Runnable oldTimeout = scheduler.pending.get(0);
        session.start("second", "asset", () -> second, () -> {});
        oldTimeout.run();
        session.stop("first");
        assertEquals(1, first.stops);
        assertEquals(0, second.stops);
        assertEquals(1, scheduler.pending.size());
        session.stop("second");
        assertEquals(1, second.stops);
    }

    @Test
    public void webAudioCleanupDoesNotSilenceNativeIncomingScreen() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback playback = new Playback();
        session.start("room", "system", () -> playback, () -> {});
        session.stopSource("asset");
        assertEquals(0, playback.stops);
        session.stop("room");
        assertEquals(1, playback.stops);
    }

    @Test
    public void legacyWebAudioWithoutRoomIdIsAlsoStoppedByRemoteAnswer() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback playback = new Playback();
        session.start(null, "asset", () -> playback, () -> {});
        session.stop("answered-room");
        assertEquals(1, playback.stops);
    }

    @Test
    public void cleanupAllReleasesThePlayerOnlyOnce() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback playback = new Playback();
        session.start("room", "asset", () -> playback, () -> {});
        session.stop(null);
        session.stop(null);
        assertEquals(1, playback.stops);
        assertTrue(scheduler.pending.isEmpty());
    }

    @Test
    public void failedStartReleasesPlayerAndAllowsNextCall() {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        Playback failed = new Playback() {
            public void start() { throw new IllegalStateException("Ошибка проигрывателя"); }
        };
        assertThrows(IllegalStateException.class, () -> session.start("failed", "asset", () -> failed, () -> {}));
        assertEquals(1, failed.stops);
        assertTrue(scheduler.pending.isEmpty());
        Playback next = new Playback();
        session.start("next", "system", () -> next, () -> {});
        assertEquals(1, next.starts);
    }

    @Test
    public void cancellationDuringPlayerStartupCannotLeaveAnOrphanPlayer() throws Exception {
        Scheduler scheduler = new Scheduler();
        CallRingtoneSession session = new CallRingtoneSession(scheduler);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Playback playback = new Playback() {
            public void start() {
                starts++;
                started.countDown();
                try {
                    assertTrue(release.await(3, TimeUnit.SECONDS));
                } catch (InterruptedException error) {
                    throw new IllegalStateException(error);
                }
            }
        };
        var executor = Executors.newFixedThreadPool(2);
        try {
            var show = executor.submit(() -> session.start("room", "system", () -> playback, () -> {}));
            assertTrue(started.await(3, TimeUnit.SECONDS));
            var dismiss = executor.submit(() -> session.stop("room"));
            release.countDown();
            show.get(3, TimeUnit.SECONDS);
            dismiss.get(3, TimeUnit.SECONDS);
            assertEquals(1, playback.stops);
            assertTrue(scheduler.pending.isEmpty());
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }
}
