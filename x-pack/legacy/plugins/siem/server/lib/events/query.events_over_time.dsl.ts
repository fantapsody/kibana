/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */
import { createQueryFilterClauses, calculateTimeseriesInterval } from '../../utils/build_query';
import { RequestBasicOptions } from '../framework';

export const buildEventsOverTimeQuery = ({
  filterQuery,
  timerange: { from, timezone, to },
  defaultIndex,
  sourceConfiguration: {
    fields: { timestamp },
  },
}: RequestBasicOptions) => {
  const filter = [
    ...createQueryFilterClauses(filterQuery),
    {
      range: {
        [timestamp]: {
          gte: from,
          lte: to,
          ...(timezone && { time_zone: timezone }),
        },
      },
    },
  ];

  const getHistogramAggregation = () => {
    const minIntervalSeconds = 10;
    const interval = calculateTimeseriesInterval(from, to, minIntervalSeconds);
    const histogramTimestampField = '@timestamp';
    const dateHistogram = {
      date_histogram: {
        field: histogramTimestampField,
        fixed_interval: `${interval}s`,
      },
    };
    const autoDateHistogram = {
      auto_date_histogram: {
        field: histogramTimestampField,
        buckets: 36,
      },
    };
    return {
      eventActionGroup: {
        terms: {
          field: 'event.action',
          missing: 'All others',
          order: {
            _count: 'desc',
          },
          size: 10,
        },
        aggs: {
          events: interval ? dateHistogram : autoDateHistogram,
        },
      },
    };
  };

  const dslQuery = {
    index: defaultIndex,
    allowNoIndices: true,
    ignoreUnavailable: true,
    body: {
      aggregations: getHistogramAggregation(),
      query: {
        bool: {
          filter,
        },
      },
      size: 0,
      track_total_hits: true,
    },
  };

  return dslQuery;
};
