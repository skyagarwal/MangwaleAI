-- Phase 2: A/B Testing Framework and Advanced Learning Service

-- Create AB Tests table
CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    hypothesis TEXT,
    enabled BOOLEAN DEFAULT true,
    control_group VARCHAR(100) NOT NULL,
    variant_group VARCHAR(100) NOT NULL,
    traffic_allocation INTEGER DEFAULT 50,
    success_metric VARCHAR(50) NOT NULL,
    target_improvement FLOAT NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_abtest_test_id ON ab_tests(test_id);
CREATE INDEX idx_abtest_enabled ON ab_tests(enabled);

-- Create AB Test Assignments table
CREATE TABLE IF NOT EXISTS ab_test_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    test_id VARCHAR(100) NOT NULL,
    variant VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, test_id),
    FOREIGN KEY (test_id) REFERENCES ab_tests(test_id) ON DELETE CASCADE
);

CREATE INDEX idx_abtest_assignment_test_id ON ab_test_assignments(test_id);
CREATE INDEX idx_abtest_assignment_variant ON ab_test_assignments(variant);

-- Create AB Test Metrics table
CREATE TABLE IF NOT EXISTS ab_test_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    test_id VARCHAR(100) NOT NULL,
    variant VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    additional_data JSONB DEFAULT '{}',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_id) REFERENCES ab_tests(test_id) ON DELETE CASCADE
);

CREATE INDEX idx_abtest_metric_test_id ON ab_test_metrics(test_id);
CREATE INDEX idx_abtest_metric_variant ON ab_test_metrics(variant);
CREATE INDEX idx_abtest_metric_name ON ab_test_metrics(metric_name);
CREATE INDEX idx_abtest_metric_recorded ON ab_test_metrics(recorded_at);

-- Create Training Data Points table (Advanced Learning)
CREATE TABLE IF NOT EXISTS training_data_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    question_type VARCHAR(100) NOT NULL,
    actual_classification BOOLEAN NOT NULL,
    predicted_classification BOOLEAN NOT NULL,
    confidence FLOAT DEFAULT 0.0,
    flow_context VARCHAR(100),
    language VARCHAR(20) DEFAULT 'en',
    user_id VARCHAR(100),
    is_error BOOLEAN DEFAULT false,
    session_id VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_training_language ON training_data_points(language);
CREATE INDEX idx_training_question_type ON training_data_points(question_type);
CREATE INDEX idx_training_is_error ON training_data_points(is_error);
CREATE INDEX idx_training_timestamp ON training_data_points(timestamp);
CREATE INDEX idx_training_created ON training_data_points(created_at);
