package com.apptracker.manage;

import com.apptracker.api.NotFoundException;
import com.apptracker.config.AppProperties;
import com.apptracker.manage.ManageModel.Country;
import com.apptracker.manage.ManageModel.CountryCreate;
import com.apptracker.manage.ManageModel.CountryUpdate;
import com.apptracker.manage.ManageModel.Genre;
import com.apptracker.manage.ManageModel.Rules;
import com.apptracker.manage.ManageModel.Status;
import com.apptracker.manage.ManageModel.Tracking;
import com.apptracker.manage.ManageModel.TrackingCreate;
import com.apptracker.manage.ManageModel.TrackingUpdate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The Settings menu: validates every change before it reaches the database.
 * The collector re-reads the configuration every minute, so changes apply
 * within a minute without a restart.
 */
@Service
public class ManageService {

    static final Set<String> CHART_TYPES = Set.of("TOP_FREE", "TOP_PAID", "TOP_GROSSING");
    private static final Pattern COUNTRY_CODE = Pattern.compile("[a-z]{2}");

    private final ManageRepository repo;
    private final RulesStore rules;
    private final RebuildJob rebuild;
    private final Clock clock;
    private final boolean adminKeyRequired;

    public ManageService(ManageRepository repo, RulesStore rules, RebuildJob rebuild, Clock clock, AppProperties props) {
        this.repo = repo;
        this.rules = rules;
        this.rebuild = rebuild;
        this.clock = clock;
        this.adminKeyRequired = props.adminKey() != null && !props.adminKey().isEmpty();
    }

    // ------------------------------------------------------------- countries

    public List<Country> countries() {
        return repo.countries();
    }

    public Country addCountry(CountryCreate in) {
        Map<String, String> errors = new LinkedHashMap<>();
        String code = in.code() == null ? "" : in.code().trim().toLowerCase();
        if (!COUNTRY_CODE.matcher(code).matches()) errors.put("code", "Two letters, e.g. ph");
        String name = checkName(in.name(), errors);
        if (!errors.isEmpty()) throw new ValidationException(errors);
        if (!repo.insertCountry(code, name, Boolean.TRUE.equals(in.enabled()))) {
            throw new ConflictException("Country " + code + " already exists");
        }
        return repo.country(code).orElseThrow();
    }

    public Country updateCountry(String code, CountryUpdate in) {
        Map<String, String> errors = new LinkedHashMap<>();
        String name = in.name() == null ? null : checkName(in.name(), errors);
        if (!errors.isEmpty()) throw new ValidationException(errors);
        if (!repo.updateCountry(code, name, in.enabled())) throw new NotFoundException("No country " + code);
        return repo.country(code).orElseThrow();
    }

    private static String checkName(String raw, Map<String, String> errors) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty() || name.length() > 80) errors.put("name", "Between 1 and 80 characters");
        return name;
    }

    // ---------------------------------------------------------------- genres

    public List<Genre> genres() {
        return repo.genres();
    }

    public Genre updateGenre(int id, Boolean enabled) {
        if (enabled == null) throw new ValidationException("enabled", "Required");
        if (!repo.updateGenre(id, enabled)) throw new NotFoundException("No genre " + id);
        return repo.genre(id).orElseThrow();
    }

    // -------------------------------------------------------------- tracking

    public List<Tracking> trackings() {
        return repo.trackings();
    }

    @Transactional
    public Tracking addTracking(TrackingCreate in) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (in.genreId() == null) {
            errors.put("genreId", "Required");
        } else if (repo.genre(in.genreId()).isEmpty()) {
            errors.put("genreId", "Unknown category " + in.genreId());
        }
        if (in.chartType() == null || !CHART_TYPES.contains(in.chartType())) {
            errors.put("chartType", "One of " + CHART_TYPES);
        }
        int depth = in.depth() == null ? 200 : in.depth();
        int interval = in.intervalMinutes() == null ? 720 : in.intervalMinutes();
        checkTuning(depth, interval, errors);
        List<String> countries = in.countries() == null ? List.of() : in.countries();
        Set<String> known = Set.copyOf(repo.countries().stream().map(Country::code).toList());
        List<String> unknown = countries.stream().filter(c -> !known.contains(c)).toList();
        if (!unknown.isEmpty()) errors.put("countries", "Unknown countries " + unknown);
        if (!errors.isEmpty()) throw new ValidationException(errors);

        long id = repo.insertTracking(in.genreId(), in.chartType(), depth, interval,
                        Boolean.TRUE.equals(in.allCountries()), in.active() == null || in.active())
                .orElseThrow(() -> new ConflictException("This category and chart type are already tracked"));
        for (String country : countries) repo.setTrackingCountry(id, country, true);
        return repo.tracking(id).orElseThrow();
    }

    public Tracking updateTracking(long id, TrackingUpdate in) {
        Map<String, String> errors = new LinkedHashMap<>();
        checkTuning(in.depth() == null ? 1 : in.depth(), in.intervalMinutes() == null ? 60 : in.intervalMinutes(), errors);
        if (!errors.isEmpty()) throw new ValidationException(errors);
        if (!repo.updateTracking(id, in.depth(), in.intervalMinutes(), in.allCountries(), in.active())) {
            throw new NotFoundException("No tracking " + id);
        }
        return repo.tracking(id).orElseThrow();
    }

    public Tracking setTrackingCountry(long id, String country, Boolean active) {
        if (active == null) throw new ValidationException("active", "Required");
        if (repo.tracking(id).isEmpty()) throw new NotFoundException("No tracking " + id);
        if (repo.country(country).isEmpty()) throw new NotFoundException("No country " + country);
        repo.setTrackingCountry(id, country, active);
        return repo.tracking(id).orElseThrow();
    }

    /** Same limits as the database CHECKs. */
    private static void checkTuning(int depth, int intervalMinutes, Map<String, String> errors) {
        if (depth < 1 || depth > 200) errors.put("depth", "Must be between 1 and 200");
        if (intervalMinutes < 5 || intervalMinutes > 1440) errors.put("intervalMinutes", "Must be between 5 and 1440");
    }

    // ----------------------------------------------------------------- rules

    public Rules rules() {
        EventRules defaults = EventRules.of(rules.defaults());
        return rules.saved()
                .map(s -> new Rules(s.rules(), defaults, true, s.updatedAt(), EventRules.TIER_CHOICES))
                .orElse(new Rules(defaults, defaults, false, null, EventRules.TIER_CHOICES));
    }

    /** New rules apply to the next snapshots; recompute to apply them to the past. */
    public Rules saveRules(EventRules in) {
        if (in == null) throw new ValidationException("rules", "Required");
        Map<String, String> errors = in.validate();
        if (!errors.isEmpty()) throw new ValidationException(errors);
        rules.save(in);
        return rules();
    }

    public Rules resetRules() {
        rules.reset();
        return rules();
    }

    // ---------------------------------------------------------------- status

    public Status status() {
        return new Status(clock.instant(), adminKeyRequired, repo.collector(), repo.events(), rebuild.state(),
                repo.chartStatuses());
    }
}
