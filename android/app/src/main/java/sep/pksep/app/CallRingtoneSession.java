package sep.pksep.app;

import java.util.Objects;
import java.util.function.Supplier;

public final class CallRingtoneSession {
    public static final long MAX_RING_DURATION_MS = 60_000L;

    public interface Playback {
        void start();
        void stop();
    }

    public interface Scheduler {
        void postDelayed(Runnable callback, long delayMs);
        void removeCallbacks(Runnable callback);
    }

    private final Scheduler scheduler;
    private Playback playback;
    private String roomId;
    private String source;
    private Runnable timeout;
    private long revision;

    public CallRingtoneSession(Scheduler scheduler) {
        this.scheduler = scheduler;
    }

    public synchronized void start(
        String nextRoomId,
        String nextSource,
        Supplier<Playback> factory,
        Runnable onExpired
    ) {
        if (playback != null && Objects.equals(roomId, nextRoomId)) return;
        stopCurrent();
        Playback nextPlayback = factory.get();
        if (nextPlayback == null) return;

        playback = nextPlayback;
        roomId = nextRoomId;
        source = nextSource;
        long currentRevision = revision;
        timeout = () -> expire(currentRevision, onExpired);
        try {
            playback.start();
            scheduler.postDelayed(timeout, MAX_RING_DURATION_MS);
        } catch (RuntimeException error) {
            stopCurrent();
            throw error;
        }
    }

    public synchronized void stop(String targetRoomId) {
        if (targetRoomId != null && roomId != null && !targetRoomId.equals(roomId)) return;
        stopCurrent();
    }

    public synchronized void stopSource(String targetSource) {
        if (Objects.equals(source, targetSource)) stopCurrent();
    }

    private void expire(long expectedRevision, Runnable onExpired) {
        synchronized (this) {
            if (playback == null || revision != expectedRevision) return;
            stopCurrent();
        }
        onExpired.run();
    }

    private void stopCurrent() {
        Playback previousPlayback = playback;
        Runnable previousTimeout = timeout;
        playback = null;
        roomId = null;
        source = null;
        timeout = null;
        revision++;
        if (previousTimeout != null) scheduler.removeCallbacks(previousTimeout);
        if (previousPlayback != null) previousPlayback.stop();
    }
}
