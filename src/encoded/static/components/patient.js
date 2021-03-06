import React from 'react';
import PropTypes from 'prop-types';
import { Panel, PanelBody, PanelHeading } from '../libs/bootstrap/panel';
import * as globals from './globals';
import { Breadcrumbs } from './navigation';
import { RelatedItems } from './item';
import { DisplayAsJson } from './objectutils';
import formatMeasurement from './../libs/formatMeasurement';
import Status from './status';



/* eslint-disable react/prefer-stateless-function */
class Patient extends React.Component {
    render() {
        const context = this.props.context;
        const itemClass = globals.itemClass(context, 'view-item');

        // Set up breadcrumbs
        const crumbs = [
            { id: 'Patients' },
            { id: <i>{context.accession}</i> },
        ];

        const crumbsReleased = (context.status === 'released');

        return (
            <div className={globals.itemClass(context, 'view-item')}>
                <header className="row">
                    <div className="col-sm-12">
                        <Breadcrumbs root="/search/?type=Patient" crumbs={crumbs} crumbsReleased={crumbsReleased} />
                        <h2>{context.accession}</h2>
                    </div>
                </header>

                <Panel>
                    <PanelHeading>
                        <h4>Patient Information</h4>
                    </PanelHeading>
                    <PanelBody>
                    <dl className="key-value">
                        <div data-test="status">
                            <dt>Status</dt>
                            <dd><Status item={context} inline /></dd>
                        </div>
                        <div data-test="gender">
                            <dt>Gender</dt>
                            <dd>{context.gender}</dd>
                        </div>

                        <div data-test="ethnicity">
                            <dt>Ethnicity</dt>
                            <dd>{context.ethnicity}</dd>
                        </div>

                        <div data-test="race">
                            <dt>Race</dt>
                            <dd>{context.race}</dd>
                        </div>

                        <div data-test="age">
                            <dt>Age at diagnosis</dt>
                            <dd className="sentence-case">
                                {formatMeasurement(context.age, context.age_units)}
                            </dd>
                        </div>



                    </dl>
                    </PanelBody>
                </Panel>

            </div>
        );
    }
}
/* eslint-enable react/prefer-stateless-function */

Patient.propTypes = {
    context: PropTypes.object, // Target object to display
};

Patient.defaultProps = {
    context: null,
};

globals.contentViews.register(Patient, 'Patient');
